// Native Edge URL Scraper using Cloudflare's HTMLRewriter
// No 3rd party APIs — uses native fetch() + HTMLRewriter to extract page structure
// Works entirely on the Edge with zero external dependencies

export interface ScrapedPageData {
  url: string;
  title: string;
  h1Tags: string[];
  h2Tags: string[];
  internalLinks: Array<{ href: string; anchor: string }>;
  metaDescription: string;
}

export interface ScrapedSiteStructure {
  homepage: ScrapedPageData;
  crawledPages: ScrapedPageData[];
  allInternalUrls: string[];
  domain: string;
}

/**
 * Scrape a single URL using native fetch() and Cloudflare HTMLRewriter.
 * Extracts <h1>, <h2>, internal <a> tags, <title>, and <meta description>.
 * Runs entirely on the Edge — no puppeteer, no cheerio, no 3rd party deps.
 */
export async function scrapeUrl(targetUrl: string): Promise<ScrapedPageData> {
  const result: ScrapedPageData = {
    url: targetUrl,
    title: '',
    h1Tags: [],
    h2Tags: [],
    internalLinks: [],
    metaDescription: '',
  };

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'SiloForge-Bot/1.0 (+https://siloforge.com)',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000), // 10s timeout per URL
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${targetUrl}`);
    }

    // Use Cloudflare HTMLRewriter to stream-parse the HTML
    // This is memory-efficient — it doesn't load the entire DOM into memory
    const rewriter = new HTMLRewriter()
      .on('title', {
        text(element: { text: string }) {
          result.title += element.text;
        },
      })
      .on('h1', {
        text(element: { text: string }) {
          result.h1Tags.push(element.text.trim());
        },
      })
      .on('h2', {
        text(element: { text: string }) {
          result.h2Tags.push(element.text.trim());
        },
      })
      .on('meta[name="description"]', {
        element(element: { getAttribute: (name: string) => string | null }) {
          const content = element.getAttribute('content');
          if (content) result.metaDescription = content;
        },
      })
      .on('a[href]', {
        element(element: { getAttribute: (name: string) => string | null }) {
          const href = element.getAttribute('href');
          if (href && isInternalLink(href, targetUrl)) {
            const fullUrl = resolveUrl(href, targetUrl);
            result.internalLinks.push({
              href: fullUrl,
              anchor: '', // Will be filled by text handler below
            });
            // Store index so text handler can set the anchor
            const linkIndex = result.internalLinks.length - 1;
            element.on('text', (text: { text: string; lastInTextNode: boolean }) => {
              if (result.internalLinks[linkIndex]) {
                result.internalLinks[linkIndex].anchor += text.text.trim();
              }
            });
          }
        },
      });

    await rewriter.transform(response).text();

    // Clean up extracted data
    result.title = result.title.trim();
    result.h1Tags = result.h1Tags.filter(h => h.length > 0);
    result.h2Tags = result.h2Tags.filter(h => h.length > 0);
    result.internalLinks = result.internalLinks
      .filter(l => l.anchor.length > 0)
      .map(l => ({
        href: l.href,
        anchor: l.anchor.substring(0, 200).trim(), // Truncate long anchors
      }));

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EdgeScraper] Failed to scrape ${targetUrl}: ${message}`);
    // Return partial data rather than throwing — we want to continue with other URLs
  }

  return result;
}

/**
 * Scrape a competitor's site starting from the homepage,
 * then crawl discovered internal links up to maxPages.
 * Uses processInBatches for concurrency control.
 */
export async function scrapeCompetitorSite(
  targetUrl: string,
  maxPages: number = 50,
  crawlConcurrency: number = 5
): Promise<ScrapedSiteStructure> {
  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname;

  // Phase 1: Scrape the homepage
  const homepage = await scrapeUrl(targetUrl);

  // Collect unique internal URLs from homepage
  const visitedUrls = new Set<string>([targetUrl]);
  const urlQueue: string[] = homepage.internalLinks
    .map(l => l.href)
    .filter(url => {
      try {
        const u = new URL(url);
        return u.hostname === domain && !isExcludedUrl(url);
      } catch { return false; }
    });

  // Deduplicate
  const uniqueQueue = [...new Set(urlQueue)].filter(u => !visitedUrls.has(u));
  const pagesToCrawl = uniqueQueue.slice(0, maxPages - 1); // -1 because we already have homepage

  // Phase 2: Crawl discovered URLs in batches with concurrency control
  const crawledPages: ScrapedPageData[] = [];

  // Dynamic import to avoid circular dependency — processInBatches is in concurrency.ts
  const { processInBatches, BATCH_SIZES } = await import('@/lib/concurrency');

  const batchSize = Math.min(crawlConcurrency, BATCH_SIZES.URL_SCRAPING);

  const results = await processInBatches(
    pagesToCrawl,
    batchSize,
    async (url: string) => {
      visitedUrls.add(url);
      return scrapeUrl(url);
    },
    (completed, total) => {
      console.log(`[EdgeScraper] Crawled ${completed}/${total} URLs for ${domain}`);
    }
  );

  crawledPages.push(...results.filter(p => p.title || p.h1Tags.length > 0));

  // Collect all discovered internal URLs
  const allInternalUrls = [...visitedUrls];

  return {
    homepage,
    crawledPages,
    allInternalUrls,
    domain,
  };
}

/**
 * Build a structured payload from scraped data to send to callAI()
 * for semantic pillar/cluster mapping.
 */
export function buildScrapedPayloadForAI(siteData: ScrapedSiteStructure): string {
  const pageSummaries = [siteData.homepage, ...siteData.crawledPages]
    .map((page, idx) => {
      const headings = [...page.h1Tags.map(h => `H1: ${h}`), ...page.h2Tags.map(h => `H2: ${h}`)].join('; ');
      const links = page.internalLinks.slice(0, 10).map(l => `"${l.anchor}" → ${l.href}`).join('; ');
      return `Page ${idx + 1}: ${page.url}\n  Title: ${page.title}\n  Headings: ${headings}\n  Links: ${links}\n  Meta: ${page.metaDescription}`;
    })
    .join('\n\n');

  return pageSummaries;
}

// ===== Helper Functions =====

function isInternalLink(href: string, baseUrl: string): boolean {
  // Relative URLs are internal
  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return true;
  }
  // Absolute URLs on same domain
  try {
    const linkHost = new URL(href, baseUrl).hostname;
    const baseHost = new URL(baseUrl).hostname;
    return linkHost === baseHost;
  } catch {
    return false;
  }
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function isExcludedUrl(url: string): boolean {
  const excludedExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.css', '.js', '.woff', '.woff2', '.ttf', '.eot',
    '.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx',
    '.mp3', '.mp4', '.avi', '.mov',
    '.rss', '.xml', '.json',
  ];
  const lower = url.toLowerCase();
  return excludedExtensions.some(ext => lower.endsWith(ext))
    || lower.includes('/wp-admin/')
    || lower.includes('/admin/')
    || lower.includes('/login')
    || lower.includes('#')
    || lower.includes('mailto:')
    || lower.includes('tel:');
}

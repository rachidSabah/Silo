import { NextRequest, NextResponse } from 'next/server';
import { scrapeCompetitorSite, buildScrapedPayloadForAI } from '@/lib/edge-scraper';
import { callAI } from '@/lib/ai';
import { createProject, createSilo, createPage, getActiveAISetting } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { processInBatches, BATCH_SIZES, retryWithBackoff } from '@/lib/concurrency';

export const runtime = 'edge';

/**
 * POST /api/import-competitor
 *
 * Scrape a competitor's domain natively on the Edge using HTMLRewriter,
 * then use callAI() to map the semantic Pillar/Cluster structure,
 * and save to D1 as a new project.
 *
 * Body: {
 *   target_url: string,        // e.g. "https://competitor.com"
 *   project_name?: string,     // Override project name (default: domain)
 *   max_pages?: number,        // Max pages to crawl (default: 50)
 *   language?: string,         // Content language (default: "en")
 * }
 *
 * Returns: { project_id, silos_created, pages_created, domain }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { target_url, project_name, max_pages, language } = body;

    if (!target_url) {
      return NextResponse.json(
        { error: 'target_url is required (e.g., "https://competitor.com")' },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(target_url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid target_url. Must be a valid URL like "https://competitor.com"' },
        { status: 400 }
      );
    }

    const domain = parsedUrl.hostname;
    const projectName = project_name || `Competitor: ${domain}`;
    const maxPages = Math.min(max_pages || 50, 100); // Cap at 100 pages

    // ===== PHASE 1: Scrape the competitor site on the Edge =====
    console.log(`[ImportCompetitor] Starting scrape of ${domain} (max ${maxPages} pages)`);

    const siteData = await scrapeCompetitorSite(
      target_url,
      maxPages,
      BATCH_SIZES.URL_SCRAPING
    );

    const totalCrawled = 1 + siteData.crawledPages.length;
    console.log(`[ImportCompetitor] Scraped ${totalCrawled} pages from ${domain}`);

    if (totalCrawled === 0 || (!siteData.homepage.title && siteData.homepage.h1Tags.length === 0)) {
      return NextResponse.json(
        { error: `Could not extract any content from ${domain}. The site may block automated access or be a SPA.` },
        { status: 422 }
      );
    }

    // ===== PHASE 2: Use callAI() to map semantic Pillar/Cluster structure =====
    console.log(`[ImportCompetitor] Sending scraped data to AI for silo mapping...`);

    const scrapedPayload = buildScrapedPayloadForAI(siteData);

    const aiMappingResult = await retryWithBackoff(async () => {
      return callAI([
        {
          role: 'system',
          content: `You are an SEO silo architect. Given a competitor's site structure extracted via web scraping, reverse-engineer their content silo architecture. Identify the semantic "Pillar" topics and their "Cluster" subtopics.

Return ONLY a JSON object with this exact structure:
{
  "niche": "identified niche/industry",
  "silos": [
    {
      "name": "Silo Name",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "pillar": {
        "title": "Pillar Page Title",
        "slug": "pillar-page-slug",
        "meta_description": "150-160 char description",
        "keywords": ["keyword1", "keyword2"]
      },
      "clusters": [
        {
          "title": "Cluster Page Title",
          "slug": "cluster-page-slug",
          "meta_description": "150-160 char description",
          "keywords": ["keyword1", "keyword2"]
        }
      ],
      "blogs": [
        {
          "title": "Blog Post Title",
          "slug": "blog-post-slug",
          "meta_description": "150-160 char description",
          "keywords": ["keyword1", "keyword2"]
        }
      ]
    }
  ]
}

Rules:
- Create 3-8 silos based on the topical clusters you detect
- Each silo MUST have exactly 1 pillar page
- Each silo should have 2-5 cluster pages
- Each silo should have 1-3 blog posts
- Infer keywords from headings, anchor text, and page titles
- Use the language: ${language || 'en'}`,
        },
        {
          role: 'user',
          content: `Reverse-engineer the silo architecture for this competitor site (${domain}):\n\n${scrapedPayload}`,
        },
      ], req);
    }, 2, 1500); // 2 retries, 1.5s base delay

    // Parse AI response
    let mappedData: {
      niche: string;
      silos: Array<{
        name: string;
        keywords: string[];
        pillar: { title: string; slug: string; meta_description: string; keywords: string[] };
        clusters: Array<{ title: string; slug: string; meta_description: string; keywords: string[] }>;
        blogs: Array<{ title: string; slug: string; meta_description: string; keywords: string[] }>;
      }>;
    };

    try {
      const cleaned = aiMappingResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      mappedData = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'AI returned invalid structure. Please try again.' },
        { status: 500 }
      );
    }

    if (!mappedData.silos || mappedData.silos.length === 0) {
      return NextResponse.json(
        { error: 'AI could not identify any content silos from the scraped data.' },
        { status: 500 }
      );
    }

    // ===== PHASE 3: Save to D1 =====
    console.log(`[ImportCompetitor] Saving ${mappedData.silos.length} silos to D1...`);

    const projectId = crypto.randomUUID();
    await createProject({
      id: projectId,
      name: projectName,
      domain: domain,
      language: language || 'en',
      niche: mappedData.niche || domain,
      seed_keywords: mappedData.silos.flatMap(s => s.keywords).join(', '),
    });

    let silosCreated = 0;
    let pagesCreated = 0;

    // Use batched processing for D1 writes
    await processInBatches(
      mappedData.silos,
      BATCH_SIZES.DB_WRITES,
      async (silo) => {
        const siloId = crypto.randomUUID();
        await createSilo({
          id: siloId,
          project_id: projectId,
          name: silo.name,
          keywords: silo.keywords.join(', '),
        });
        silosCreated++;

        // Create pillar page
        if (silo.pillar) {
          await createPage({
            id: crypto.randomUUID(),
            project_id: projectId,
            silo_id: siloId,
            title: silo.pillar.title,
            slug: silo.pillar.slug,
            meta_description: silo.pillar.meta_description,
            keywords: silo.pillar.keywords.join(', '),
            type: 'pillar',
            status: 'draft',
          });
          pagesCreated++;
        }

        // Create cluster pages
        for (const cluster of (silo.clusters || [])) {
          await createPage({
            id: crypto.randomUUID(),
            project_id: projectId,
            silo_id: siloId,
            title: cluster.title,
            slug: cluster.slug,
            meta_description: cluster.meta_description,
            keywords: cluster.keywords.join(', '),
            type: 'cluster',
            status: 'draft',
          });
          pagesCreated++;
        }

        // Create blog pages
        for (const blog of (silo.blogs || [])) {
          await createPage({
            id: crypto.randomUUID(),
            project_id: projectId,
            silo_id: siloId,
            title: blog.title,
            slug: blog.slug,
            meta_description: blog.meta_description,
            keywords: blog.keywords.join(', '),
            type: 'blog',
            status: 'draft',
          });
          pagesCreated++;
        }
      }
    );

    console.log(`[ImportCompetitor] Done! Project ${projectId}: ${silosCreated} silos, ${pagesCreated} pages`);

    return NextResponse.json({
      project_id: projectId,
      silos_created: silosCreated,
      pages_created: pagesCreated,
      domain,
      niche: mappedData.niche,
      pages_crawled: totalCrawled,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import failed';
    console.error('[ImportCompetitor] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

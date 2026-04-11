import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getProjectById, getPagesByProject, updatePageGSCMetrics } from '@/lib/db';
import { processInBatches, BATCH_SIZES, retryWithBackoff } from '@/lib/concurrency';

export const runtime = 'edge';

/**
 * POST /api/gsc-sync
 *
 * OAuth-secured endpoint to fetch GSC API data and map it to matching page URLs in D1.
 * Requires the user to have a valid Google OAuth access token.
 *
 * Body: {
 *   project_id: string,
 *   access_token: string,       // Google OAuth2 access token
 *   site_url?: string,          // GSC property URL (default: project domain)
 *   start_date?: string,        // YYYY-MM-DD (default: 30 days ago)
 *   end_date?: string,          // YYYY-MM-DD (default: today)
 *   row_limit?: number,         // Max rows from GSC API (default: 5000)
 * }
 *
 * Returns: { synced_pages, total_clicks, total_impressions, avg_position }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, access_token, site_url, start_date, end_date, row_limit } = body;

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    if (!access_token) {
      return NextResponse.json({ error: 'Google OAuth access_token is required' }, { status: 400 });
    }

    // Get project details
    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const propertyUrl = site_url || (project as Record<string, unknown>).domain as string || '';
    if (!propertyUrl) {
      return NextResponse.json({ error: 'site_url or project domain is required' }, { status: 400 });
    }

    // Default date range: last 30 days
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ===== PHASE 1: Fetch GSC data from Google API =====
    console.log(`[GSC-Sync] Fetching GSC data for ${propertyUrl} (${startDate} to ${endDate})`);

    const gscData = await fetchGSCData(
      access_token,
      propertyUrl,
      startDate,
      endDate,
      row_limit || 5000
    );

    if (!gscData || gscData.length === 0) {
      return NextResponse.json({
        synced_pages: 0,
        total_clicks: 0,
        total_impressions: 0,
        avg_position: 0,
        message: 'No GSC data found for this property and date range.',
      });
    }

    console.log(`[GSC-Sync] Received ${gscData.length} rows from GSC API`);

    // ===== PHASE 2: Aggregate GSC data by page URL =====
    // GSC returns one row per (page_url, query) combination, so we need to aggregate
    const pageMetrics = aggregateGSCByPage(gscData);

    // ===== PHASE 3: Match GSC URLs to D1 pages and update =====
    const pages = await getPagesByProject(project_id) as Array<Record<string, unknown>>;
    const projectDomain = (project as Record<string, unknown>).domain as string;

    let syncedCount = 0;

    await processInBatches(
      Array.from(pageMetrics.entries()),
      BATCH_SIZES.DB_WRITES,
      async ([pageUrl, metrics]) => {
        // Try to find a matching page in D1 by slug or URL
        const matchingPage = findMatchingPage(pages, pageUrl, projectDomain);

        if (matchingPage) {
          await updatePageGSCMetrics(matchingPage.id as string, {
            clicks: metrics.clicks,
            impressions: metrics.impressions,
            position: metrics.avgPosition,
            ctr: metrics.ctr,
          });
          syncedCount++;
        }
      }
    );

    // Compute totals
    const totalClicks = Array.from(pageMetrics.values()).reduce((sum, m) => sum + m.clicks, 0);
    const totalImpressions = Array.from(pageMetrics.values()).reduce((sum, m) => sum + m.impressions, 0);
    const avgPosition = pageMetrics.size > 0
      ? Array.from(pageMetrics.values()).reduce((sum, m) => sum + m.avgPosition, 0) / pageMetrics.size
      : 0;

    console.log(`[GSC-Sync] Synced ${syncedCount}/${pages.length} pages`);

    return NextResponse.json({
      synced_pages: syncedCount,
      total_pages: pages.length,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      avg_position: Math.round(avgPosition * 10) / 10,
      gsc_rows_fetched: gscData.length,
      date_range: { start: startDate, end: endDate },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'GSC sync failed';
    console.error('[GSC-Sync] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== GSC API Helper =====

interface GSCRow {
  keys: string[];  // [page_url, query] or [page_url] depending on dimensions
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

async function fetchGSCData(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit: number
): Promise<GSCRow[]> {
  // Ensure siteUrl has protocol prefix for GSC API
  const encodedSiteUrl = encodeURIComponent(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);

  const response = await retryWithBackoff(async () => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['page'],  // Aggregate by page URL
          rowLimit: Math.min(rowLimit, 25000),  // GSC API max
          type: 'web',
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error(`GSC API auth error (${res.status}): Token may be expired. ${errBody.slice(0, 200)}`);
      }
      throw new Error(`GSC API error (${res.status}): ${errBody.slice(0, 200)}`);
    }

    return res.json();
  }, 2, 1000);

  return response.rows || [];
}

// ===== Aggregation Helpers =====

interface PageMetrics {
  clicks: number;
  impressions: number;
  avgPosition: number;
  ctr: number;
}

function aggregateGSCByPage(gscRows: GSCRow[]): Map<string, PageMetrics> {
  const pageMap = new Map<string, { clicks: number; impressions: number; positionSum: number; ctrSum: number; count: number }>();

  for (const row of gscRows) {
    const pageUrl = row.keys[0];
    if (!pageUrl) continue;

    const existing = pageMap.get(pageUrl) || { clicks: 0, impressions: 0, positionSum: 0, ctrSum: 0, count: 0 };
    existing.clicks += row.clicks || 0;
    existing.impressions += row.impressions || 0;
    existing.positionSum += (row.position || 0) * (row.impressions || 1);
    existing.ctrSum += row.ctr || 0;
    existing.count += 1;
    pageMap.set(pageUrl, existing);
  }

  const result = new Map<string, PageMetrics>();
  for (const [url, data] of pageMap) {
    result.set(url, {
      clicks: data.clicks,
      impressions: data.impressions,
      avgPosition: data.impressions > 0 ? data.positionSum / data.impressions : 0,
      ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
    });
  }

  return result;
}

/**
 * Match a GSC page URL to a D1 page record.
 * Tries matching by: exact URL → slug → partial path.
 */
function findMatchingPage(
  pages: Array<Record<string, unknown>>,
  gscUrl: string,
  projectDomain: string
): Record<string, unknown> | null {
  try {
    const urlObj = new URL(gscUrl);
    const path = urlObj.pathname;
    const slugFromPath = path.replace(/^\/|\/$/g, '').split('/').pop() || '';

    // Try exact slug match
    let match = pages.find(p => (p.slug as string) === slugFromPath);
    if (match) return match;

    // Try path match
    match = pages.find(p => {
      const pageSlug = p.slug as string;
      return path === `/${pageSlug}` || path.endsWith(`/${pageSlug}`);
    });
    if (match) return match;

    // Try fuzzy slug match (last segment of path)
    match = pages.find(p => {
      const pageSlug = (p.slug as string).toLowerCase();
      return slugFromPath.toLowerCase().includes(pageSlug) || pageSlug.includes(slugFromPath.toLowerCase());
    });
    return match;

  } catch {
    return null;
  }
}

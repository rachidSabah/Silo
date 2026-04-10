import { NextRequest, NextResponse } from 'next/server';
import { bulkGenerateSiloArticles } from '@/lib/ai';

export const runtime = 'edge';

/**
 * POST /api/ai/bulk-generate
 * Bulk generate articles for an entire silo with context awareness.
 *
 * Body: {
 *   siloName, niche,
 *   pages: [{ id, title, slug, type, keywords }],
 *   brandVoice
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { siloName, niche, pages, brandVoice } = body;

    if (!siloName || !pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { error: 'siloName and a non-empty pages array are required' },
        { status: 400 }
      );
    }

    // For edge runtime, we can't stream easily, so we generate all and return
    // Progress tracking happens client-side
    const results = await bulkGenerateSiloArticles(
      siloName,
      niche || 'general',
      pages,
      brandVoice || '',
      undefined, // No server-side progress callback in edge
      req
    );

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate any articles. Check your AI provider settings.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      articles: results,
      total: results.length,
      failed: pages.length - results.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bulk generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

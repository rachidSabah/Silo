import { NextRequest, NextResponse } from 'next/server';
import { generateSiloAwareArticle, type SiloContext } from '@/lib/ai';

export const runtime = 'edge';

/**
 * POST /api/ai/generate-article
 * Generate a single silo-aware article with full context awareness.
 *
 * Body: {
 *   pageTitle, pageType, pageKeywords,
 *   siloContext: { siloName, pillarPage, siblingPages, internalLinks, brandVoice, niche },
 *   wordCountTarget
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pageTitle, pageType, pageKeywords, siloContext, wordCountTarget } = body;

    if (!pageTitle || !pageType || !siloContext) {
      return NextResponse.json(
        { error: 'pageTitle, pageType, and siloContext are required' },
        { status: 400 }
      );
    }

    const context: SiloContext = {
      siloName: siloContext.siloName || 'General',
      pillarPage: siloContext.pillarPage || null,
      siblingPages: siloContext.siblingPages || [],
      internalLinks: siloContext.internalLinks || [],
      brandVoice: siloContext.brandVoice,
      niche: siloContext.niche || 'general',
    };

    const article = await generateSiloAwareArticle(
      pageTitle,
      pageType,
      pageKeywords || [],
      context,
      wordCountTarget || (pageType === 'pillar' ? 3000 : pageType === 'cluster' ? 2000 : 1500),
      req
    );

    if (!article) {
      return NextResponse.json(
        { error: 'Failed to generate article. The AI returned invalid content.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ article });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Article generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

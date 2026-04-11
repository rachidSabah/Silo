import { NextRequest, NextResponse } from 'next/server';
import { generateContentBrief } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pageTitle, pageType, siloName, keywords, siblingPages, niche } = body;

    if (!pageTitle || !pageType || !siloName) {
      return NextResponse.json({ error: 'pageTitle, pageType, and siloName are required' }, { status: 400 });
    }

    const brief = await generateContentBrief(
      pageTitle,
      pageType,
      siloName,
      keywords || [],
      siblingPages || [],
      niche || 'general',
      req
    );

    if (!brief) {
      return NextResponse.json({ error: 'Failed to generate content brief' }, { status: 500 });
    }

    return NextResponse.json({ brief });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Content brief generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

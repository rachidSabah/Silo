import { NextRequest, NextResponse } from 'next/server';
import { expandKeywords } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { seedKeywords, niche, language } = body;

    if (!seedKeywords || !Array.isArray(seedKeywords) || seedKeywords.length === 0) {
      return NextResponse.json({ error: 'seedKeywords is required' }, { status: 400 });
    }

    const keywords = await expandKeywords(seedKeywords, niche || '', language || 'en', req);
    return NextResponse.json({ keywords });
  } catch (error) {
    console.error('Expand keywords error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

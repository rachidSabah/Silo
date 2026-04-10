import { NextRequest, NextResponse } from 'next/server';
import { groupKeywords } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keywords, niche } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Keywords array is required' }, { status: 400 });
    }

    const clusters = await groupKeywords(keywords, niche || 'general', req);
    return NextResponse.json({ clusters });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Keyword clustering failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

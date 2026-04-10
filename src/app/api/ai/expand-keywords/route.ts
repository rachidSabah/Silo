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

    const keywords = await expandKeywords(seedKeywords, niche || '', language || 'en');
    return NextResponse.json({ keywords });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

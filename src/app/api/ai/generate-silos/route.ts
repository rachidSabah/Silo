import { NextRequest, NextResponse } from 'next/server';
import { generateSilos } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { niche, keywords, language } = body;

    if (!niche && (!keywords || keywords.length === 0)) {
      return NextResponse.json({ error: 'Niche or keywords are required' }, { status: 400 });
    }

    const silos = await generateSilos(niche || '', keywords || [], language || 'en', req);
    return NextResponse.json({ silos });
  } catch (error) {
    console.error('Generate silos error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

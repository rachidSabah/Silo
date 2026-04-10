import { NextRequest, NextResponse } from 'next/server';
import { analyzeContentGap } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userSilos, competitorSilos, niche } = body;

    if (!userSilos || !competitorSilos || !niche) {
      return NextResponse.json({ error: 'userSilos, competitorSilos, and niche are required' }, { status: 400 });
    }

    const gaps = await analyzeContentGap(userSilos, competitorSilos, niche, req);
    return NextResponse.json({ gaps });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Content gap analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { generateSilos } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { niche, keywords, language } = body;

    if (!niche) {
      return NextResponse.json({ error: 'niche is required' }, { status: 400 });
    }

    const silos = await generateSilos(niche, keywords || [], language || 'en');
    return NextResponse.json({ silos });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

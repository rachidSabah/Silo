import { NextRequest, NextResponse } from 'next/server';
import { generatePages } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { silos, niche, language } = body;

    if (!silos || !Array.isArray(silos) || silos.length === 0) {
      return NextResponse.json({ error: 'silos array is required' }, { status: 400 });
    }

    const pagesBySilo = await generatePages(silos, niche || '', language || 'en');
    return NextResponse.json({ pagesBySilo });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

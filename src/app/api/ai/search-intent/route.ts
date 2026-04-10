import { NextRequest, NextResponse } from 'next/server';
import { mapSearchIntent } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keywords } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Keywords array is required' }, { status: 400 });
    }

    const intentMap = await mapSearchIntent(keywords, req);
    return NextResponse.json({ intents: intentMap });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Intent mapping failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { suggestInternalLinks } from '@/lib/ai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pages, silos } = body;

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'Pages are required' }, { status: 400 });
    }

    const links = await suggestInternalLinks(pages, silos || [], req);
    return NextResponse.json({ links });
  } catch (error) {
    console.error('Internal links error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

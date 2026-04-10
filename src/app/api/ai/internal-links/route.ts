import { NextRequest, NextResponse } from 'next/server';
import { suggestInternalLinks } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pages, silos } = body;

    if (!pages || !Array.isArray(pages)) {
      return NextResponse.json({ error: 'pages array is required' }, { status: 400 });
    }

    const links = await suggestInternalLinks(pages, silos || []);
    return NextResponse.json({ links });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

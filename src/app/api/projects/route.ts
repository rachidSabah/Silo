import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllProjects, createProject } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  try {
    const projects = await getAllProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id || uuidv4();

    await createProject({
      id,
      name: body.name,
      domain: body.domain,
      language: body.language || 'en',
      niche: body.niche,
      seed_keywords: body.seedKeywords ? JSON.stringify(body.seedKeywords) : null,
    });

    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

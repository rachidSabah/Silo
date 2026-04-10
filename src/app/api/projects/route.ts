import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createProject, getAllProjects } from '@/lib/sqlite';

export async function GET() {
  try {
    const projects = getAllProjects();
    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id || uuidv4();

    createProject({
      id,
      name: body.name,
      domain: body.domain,
      language: body.language || 'en',
      niche: body.niche,
      seed_keywords: body.seedKeywords ? JSON.stringify(body.seedKeywords) : null,
    });

    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

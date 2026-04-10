import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getPagesByProject, createPage } from '@/lib/db';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }
    const pages = await getPagesByProject(projectId);
    return NextResponse.json(pages);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      const results = [];
      for (const page of body) {
        const id = page.id || uuidv4();
        await createPage({ id, project_id: page.project_id, silo_id: page.silo_id, title: page.title, slug: page.slug, meta_description: page.meta_description, keywords: page.keywords, type: page.type, parent_id: page.parent_id });
        results.push({ id, ...page });
      }
      return NextResponse.json(results, { status: 201 });
    }

    const id = body.id || uuidv4();
    await createPage({ id, project_id: body.project_id, silo_id: body.silo_id, title: body.title, slug: body.slug, meta_description: body.meta_description, keywords: body.keywords, type: body.type, parent_id: body.parent_id });
    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

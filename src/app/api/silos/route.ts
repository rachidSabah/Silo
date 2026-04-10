import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSilosByProject, createSilo } from '@/lib/sqlite';

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }
    const silos = getSilosByProject(projectId);
    return NextResponse.json(silos);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      const results = body.map((silo: { id?: string; project_id: string; name: string }) => {
        const id = silo.id || uuidv4();
        createSilo({ id, project_id: silo.project_id, name: silo.name });
        return { id, ...silo };
      });
      return NextResponse.json(results, { status: 201 });
    }

    const id = body.id || uuidv4();
    createSilo({ id, project_id: body.project_id, name: body.name });
    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

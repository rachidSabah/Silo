import { NextRequest, NextResponse } from 'next/server';
import { getInternalLinksByProject, createInternalLink, deleteInternalLink, deleteInternalLinksByProject } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'edge';

// GET /api/internal-links?project_id=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }
    const links = await getInternalLinksByProject(projectId);
    return NextResponse.json({ links });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch internal links';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/internal-links — create single or batch
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, links } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Batch create
    if (Array.isArray(links)) {
      // Clear existing links for this project first
      await deleteInternalLinksByProject(projectId);

      const created: Array<{ id: string; from: string; to: string; anchor: string }> = [];
      for (const link of links) {
        const id = uuidv4();
        await createInternalLink({
          id,
          project_id: projectId,
          from_page_id: link.from,
          to_page_id: link.to,
          anchor: link.anchor,
        });
        created.push({ id, ...link });
      }
      return NextResponse.json({ links: created });
    }

    // Single create
    const { from, to, anchor } = body;
    if (!from || !to || !anchor) {
      return NextResponse.json({ error: 'from, to, and anchor are required' }, { status: 400 });
    }
    const id = uuidv4();
    await createInternalLink({ id, project_id: projectId, from_page_id: from, to_page_id: to, anchor });
    return NextResponse.json({ link: { id, from, to, anchor } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create internal link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/internal-links?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await deleteInternalLink(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete internal link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getPagesByProject, getSilosByProject } from '@/lib/db';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const [pages, silos] = await Promise.all([
      getPagesByProject(projectId),
      getSilosByProject(projectId),
    ]);

    const typedPages = pages as Array<{
      slug: string;
      title: string;
      meta_description: string | null;
      keywords: string | null;
      type: string;
      silo_id: string | null;
    }>;

    const typedSilos = silos as Array<{
      id: string;
      name: string;
    }>;

    // Build silo ID to name map
    const siloNameMap = new Map(typedSilos.map((s) => [s.id, s.name]));

    const csvData = typedPages.map((page) => ({
      slug: page.slug,
      title: page.title,
      meta_description: page.meta_description || '',
      keywords: page.keywords || '',
      type: page.type,
      parent_silo: page.silo_id ? (siloNameMap.get(page.silo_id) || page.silo_id) : '',
    }));

    const csv = Papa.unparse(csvData);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="siloforge-pages-${projectId}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export CSV error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

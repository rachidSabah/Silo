import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getPagesByProject } from '@/lib/db';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const pages = await getPagesByProject(projectId) as Array<{
      slug: string;
      title: string;
      meta_description: string | null;
      keywords: string | null;
      type: string;
      silo_id: string | null;
    }>;

    const csvData = pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      meta_description: page.meta_description || '',
      keywords: page.keywords || '',
      type: page.type,
      parent_silo: page.silo_id || '',
    }));

    const csv = Papa.unparse(csvData);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="siloforge-pages-${projectId}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

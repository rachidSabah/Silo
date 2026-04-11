import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getGSCMetricsBySilo, getProjectById } from '@/lib/db';

export const runtime = 'edge';

/**
 * GET /api/projects/[id]/gsc-metrics
 *
 * Returns GSC metrics aggregated by silo for a given project.
 * Used by the GSCAnalyticsDashboard component.
 *
 * Headers: Authorization: Bearer <token>
 *
 * Returns: {
 *   metrics: GSCSiloMetrics[],
 *   project_id: string,
 * }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Verify project exists
    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get GSC metrics aggregated by silo
    const metrics = await getGSCMetricsBySilo(projectId);

    return NextResponse.json({
      metrics,
      project_id: projectId,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch GSC metrics';
    console.error('[GSC-Metrics] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

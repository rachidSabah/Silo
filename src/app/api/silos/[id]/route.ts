import { NextRequest, NextResponse } from 'next/server';
import { updateSilo, deleteSilo } from '@/lib/db';

export const runtime = 'edge';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    await updateSilo(id, {
      name: body.name,
      keywords: body.keywords,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/silos/[id] error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSilo(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/silos/[id] error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

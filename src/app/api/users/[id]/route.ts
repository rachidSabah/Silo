import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, hashPassword } from '@/lib/auth';
import { updateUser, deleteUser } from '@/lib/db';

export const runtime = 'edge';

// PUT update user (admin only, or user updating own profile)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await getUserFromRequest(req);
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const isSelfUpdate = payload.userId === id;
    const isAdmin = payload.role === 'admin';

    if (!isSelfUpdate && !isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const updateData: { email?: string; name?: string; role?: string; password_hash?: string; salt?: string } = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.email !== undefined) updateData.email = body.email.toLowerCase().trim();

    // Only admin can change role
    if (body.role !== undefined && isAdmin && !isSelfUpdate) {
      updateData.role = body.role;
    }

    // Handle password change
    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      const { hash, salt } = await hashPassword(body.password);
      updateData.password_hash = hash;
      updateData.salt = salt;
    }

    await updateUser(id, updateData);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT user error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE user (admin only, cannot delete self)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await getUserFromRequest(req);
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (payload.userId === id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await deleteUser(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE user error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

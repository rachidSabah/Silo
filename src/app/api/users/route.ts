import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getUserFromRequest, hashPassword } from '@/lib/auth';
import { getAllUsers, createUser, updateUser, deleteUser, getUserByEmail } from '@/lib/db';

export const runtime = 'edge';

// GET all users (admin only)
export async function GET(req: NextRequest) {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const users = await getAllUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error('GET users error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST create user (admin only)
export async function POST(req: NextRequest) {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email, name, password, role } = await req.json();

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check if email already exists
    const existing = await getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const { hash, salt } = await hashPassword(password);
    const id = uuidv4();
    await createUser({
      id,
      email: email.toLowerCase().trim(),
      password_hash: hash,
      salt,
      name: name.trim(),
      role: role || 'user',
    });

    return NextResponse.json({ id, email, name, role: role || 'user' }, { status: 201 });
  } catch (error) {
    console.error('POST users error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

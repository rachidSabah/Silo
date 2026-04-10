import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getUserFromRequest } from '@/lib/auth';
import { getAISettingsByUser, upsertAISetting, deleteAISetting, setActiveAISetting } from '@/lib/db';

export const runtime = 'edge';

// GET AI settings for current user
export async function GET(req: NextRequest) {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const settings = await getAISettingsByUser(payload.userId);
    // Mask API keys for security
    const masked = settings.map((s) => ({
      ...s,
      api_key: s.api_key ? s.api_key.slice(0, 8) + '...' + s.api_key.slice(-4) : '',
    }));
    return NextResponse.json(masked);
  } catch (error) {
    console.error('GET settings error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST create/update AI setting
export async function POST(req: NextRequest) {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id, provider, api_key, model, is_active } = await req.json();

    if (!provider || !api_key || !model) {
      return NextResponse.json({ error: 'Provider, API key, and model are required' }, { status: 400 });
    }

    const settingId = id || uuidv4();
    await upsertAISetting({
      id: settingId,
      user_id: payload.userId,
      provider,
      api_key,
      model,
      is_active: is_active ? 1 : 0,
    });

    return NextResponse.json({ id: settingId, provider, model, is_active }, { status: 201 });
  } catch (error) {
    console.error('POST settings error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT activate a setting
export async function PUT(req: NextRequest) {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Setting ID is required' }, { status: 400 });
    }

    await setActiveAISetting(id, payload.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT settings error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE a setting
export async function DELETE(req: NextRequest) {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Setting ID is required' }, { status: 400 });
    }

    await deleteAISetting(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE settings error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

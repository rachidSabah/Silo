import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

/**
 * GET /api/gsc-auth
 *
 * Initiates Google OAuth2 flow for GSC access.
 * Redirects user to Google's consent screen with the required scopes.
 *
 * Query params:
 *   - redirect_uri: Where to redirect after auth (default: current origin + /api/gsc-auth/callback)
 *
 * Required env vars (set in wrangler.toml or Cloudflare dashboard):
 *   - GSC_CLIENT_ID: Google OAuth2 client ID
 *   - GSC_CLIENT_SECRET: Google OAuth2 client secret
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const url = new URL(req.url);
    const origin = url.origin;

    // Google OAuth2 scopes for GSC read-only access
    const scopes = [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/webmasters',
    ].join(' ');

    const redirectUri = `${origin}/api/gsc-auth/callback`;
    const clientId = getGSCClientId();

    if (!clientId) {
      return NextResponse.json(
        { error: 'GSC_CLIENT_ID not configured. Add it to your Cloudflare environment variables.' },
        { status: 500 }
      );
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', user.userId); // Pass user ID in state for verification

    return NextResponse.redirect(authUrl.toString());

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'GSC auth failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/gsc-auth
 *
 * Exchange an authorization code for access/refresh tokens.
 *
 * Body: { code: string, redirect_uri?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/gsc-auth/callback`;

    const clientId = getGSCClientId();
    const clientSecret = getGSCClientSecret();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'GSC OAuth credentials not configured.' },
        { status: 500 }
      );
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      return NextResponse.json(
        { error: `Token exchange failed: ${errBody.slice(0, 200)}` },
        { status: 400 }
      );
    }

    const tokenData = await tokenRes.json();

    return NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== Environment Helpers =====

function getGSCClientId(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@cloudflare/next-on-pages').getRequestContext();
    return env?.GSC_CLIENT_ID || process.env.GSC_CLIENT_ID || null;
  } catch {
    return process.env.GSC_CLIENT_ID || null;
  }
}

function getGSCClientSecret(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@cloudflare/next-on-pages').getRequestContext();
    return env?.GSC_CLIENT_SECRET || process.env.GSC_CLIENT_SECRET || null;
  } catch {
    return process.env.GSC_CLIENT_SECRET || null;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

/**
 * GET /api/gsc-auth/callback
 *
 * OAuth2 callback handler for Google Search Console.
 * Google redirects here after the user consents.
 * Exchanges the authorization code for access/refresh tokens,
 * then redirects to the frontend with tokens in the URL hash.
 *
 * Query params (from Google):
 *   - code: Authorization code to exchange
 *   - state: User ID passed during auth initiation
 *   - error: If user denied access
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  // User denied access
  if (error) {
    const frontendUrl = new URL('/', url.origin);
    frontendUrl.searchParams.set('gsc_error', error);
    return NextResponse.redirect(frontendUrl.toString());
  }

  if (!code) {
    const frontendUrl = new URL('/', url.origin);
    frontendUrl.searchParams.set('gsc_error', 'no_code');
    return NextResponse.redirect(frontendUrl.toString());
  }

  try {
    const clientId = getGSCClientId();
    const clientSecret = getGSCClientSecret();

    if (!clientId || !clientSecret) {
      const frontendUrl = new URL('/', url.origin);
      frontendUrl.searchParams.set('gsc_error', 'config_missing');
      return NextResponse.redirect(frontendUrl.toString());
    }

    const redirectUri = `${url.origin}/api/gsc-auth/callback`;

    // Exchange authorization code for tokens
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
      console.error('[GSC-Callback] Token exchange failed:', errBody.slice(0, 300));
      const frontendUrl = new URL('/', url.origin);
      frontendUrl.searchParams.set('gsc_error', 'token_exchange_failed');
      return NextResponse.redirect(frontendUrl.toString());
    }

    const tokenData = await tokenRes.json();

    // Redirect to frontend with tokens in hash (not query params, for security)
    const frontendUrl = new URL('/', url.origin);
    frontendUrl.hash = `gsc_access_token=${encodeURIComponent(tokenData.access_token)}&gsc_refresh_token=${encodeURIComponent(tokenData.refresh_token || '')}&gsc_expires_in=${tokenData.expires_in || 3600}`;

    return NextResponse.redirect(frontendUrl.toString());

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    console.error('[GSC-Callback] Error:', message);
    const frontendUrl = new URL('/', url.origin);
    frontendUrl.searchParams.set('gsc_error', 'internal_error');
    return NextResponse.redirect(frontendUrl.toString());
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

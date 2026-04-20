// Google Business Profile OAuth & API Integration
// Compatible with Cloudflare Workers edge runtime (no Node.js APIs)

// ===== Types =====

interface GBPCredentials {
  clientId: string | null;
  clientSecret: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface GBPLocation {
  name: string; // resource name like "accounts/123/locations/456"
  title: string;
  storefrontAddress?: { addressLines: string[] };
  phoneNumbers?: { primaryPhone: string };
  latlng?: { latitude: number; longitude: number };
  categories?: { primaryCategory: { displayName: string } };
  websiteUri?: string;
}

interface GBPPost {
  summary: string;
  topicType?: 'STANDARD' | 'EVENT' | 'OFFER';
  event?: {
    title: string;
    schedule: {
      startDate: { year: number; month: number; day: number };
      endDate: { year: number; month: number; day: number };
    };
  };
  offer?: {
    couponCode?: string;
    redeemOnlineUrl?: string;
    termsConditions?: string;
  };
  callToAction?: {
    actionType: string; // e.g. 'BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL', 'VISIT'
    url?: string;
  };
  media?: Array<{
    mediaFormat: 'PHOTO' | 'VIDEO';
    sourceUrl?: string;
  }>;
}

// ===== Environment Helpers =====

/**
 * Reads GBP OAuth credentials from Cloudflare environment variables.
 * Set via: wrangler pages secret put GBP_CLIENT_ID / GBP_CLIENT_SECRET
 * Falls back to process.env for local development.
 */
export function getGBPCredentials(): GBPCredentials {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@cloudflare/next-on-pages').getRequestContext();
    return {
      clientId: env?.GBP_CLIENT_ID || process.env.GBP_CLIENT_ID || null,
      clientSecret: env?.GBP_CLIENT_SECRET || process.env.GBP_CLIENT_SECRET || null,
    };
  } catch {
    return {
      clientId: process.env.GBP_CLIENT_ID || null,
      clientSecret: process.env.GBP_CLIENT_SECRET || null,
    };
  }
}

// ===== OAuth Flow =====

/**
 * Generates a Google OAuth2 authorization URL for GBP access.
 * Redirects the user to Google's consent screen.
 *
 * @param origin - The app's origin (e.g. "https://app.siloforge.com")
 * @param userId - The current user's ID, passed as state for CSRF protection
 * @returns The full Google OAuth URL to redirect the user to
 */
export function generateAuthURL(origin: string, userId: string): string {
  const { clientId } = getGBPCredentials();

  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
    'https://www.googleapis.com/auth/business.info',
  ].join(' ');

  const redirectUri = `${origin}/api/gbp-auth/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId || '');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to always get a refresh token
  authUrl.searchParams.set('state', userId);

  return authUrl.toString();
}

/**
 * Exchanges an OAuth authorization code for access and refresh tokens.
 *
 * @param code - The authorization code received from the OAuth callback
 * @param origin - The app's origin (must match the redirect_uri used during auth)
 * @returns Token response with access_token, refresh_token, and expires_in
 * @throws Error if credentials are missing or token exchange fails
 */
export async function exchangeCodeForTokens(
  code: string,
  origin: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getGBPCredentials();

  if (!clientId || !clientSecret) {
    throw new Error(
      'GBP OAuth credentials not configured. Set GBP_CLIENT_ID and GBP_CLIENT_SECRET via `wrangler pages secret put`.'
    );
  }

  const redirectUri = `${origin}/api/gbp-auth/callback`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GBP token exchange failed (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

/**
 * Refreshes an expired access token using a refresh token.
 * GBP access tokens typically expire after 1 hour.
 *
 * @param refreshToken - The stored refresh token
 * @returns New token response with fresh access_token and expires_in
 * @throws Error if credentials are missing or refresh fails
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getGBPCredentials();

  if (!clientId || !clientSecret) {
    throw new Error(
      'GBP OAuth credentials not configured. Set GBP_CLIENT_ID and GBP_CLIENT_SECRET via `wrangler pages secret put`.'
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GBP token refresh failed (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  };
}

// ===== GBP API Helpers =====

/**
 * Fetches all GBP locations for the authenticated account.
 * Handles pagination automatically via pageToken.
 *
 * @param accessToken - A valid Google OAuth access token with business.manage scope
 * @returns Array of GBP location objects
 * @throws Error if the API request fails
 */
export async function fetchGBPLocations(
  accessToken: string
): Promise<GBPLocation[]> {
  const allLocations: GBPLocation[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/*/locations'
    );
    url.searchParams.set(
      'readMask',
      'name,title,storefrontAddress,phoneNumbers,latlng,categories,websiteUri'
    );
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GBP fetch locations failed (${response.status}): ${errorBody.slice(0, 500)}`
      );
    }

    const data = await response.json();
    const locations: GBPLocation[] = data.locations || [];
    allLocations.push(...locations);
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return allLocations;
}

/**
 * Fetches reviews for a specific GBP location.
 *
 * @param accessToken - A valid Google OAuth access token with business.manage scope
 * @param locationName - The location resource name (e.g. "accounts/123/locations/456")
 * @returns Array of review objects from the GBP API
 * @throws Error if the API request fails
 */
export async function fetchGBPReviews(
  accessToken: string,
  locationName: string
): Promise<any[]> {
  const allReviews: any[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://mybusinessaccountmanagement.googleapis.com/v1/${locationName}/reviews`
    );
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GBP fetch reviews failed (${response.status}): ${errorBody.slice(0, 500)}`
      );
    }

    const data = await response.json();
    const reviews: any[] = data.reviews || [];
    allReviews.push(...reviews);
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return allReviews;
}

/**
 * Publishes a new local post to a GBP location.
 *
 * @param accessToken - A valid Google OAuth access token with business.manage scope
 * @param locationName - The location resource name (e.g. "accounts/123/locations/456")
 * @param post - The post payload (summary, topicType, callToAction, media, etc.)
 * @returns The created post object from the GBP API
 * @throws Error if the API request fails
 */
export async function publishGBPPost(
  accessToken: string,
  locationName: string,
  post: GBPPost
): Promise<any> {
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}/localPosts`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(post),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GBP publish post failed (${response.status}): ${errorBody.slice(0, 500)}`
    );
  }

  return response.json();
}

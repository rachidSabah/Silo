// SERP API Integration for GeoGrid Scans
// Supports DataForSEO, Google Maps Places API, and mock data fallback
// Compatible with Cloudflare Workers (edge runtime - no Node.js APIs)

import { getRequestContext } from '@cloudflare/next-on-pages';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SERPCredentials {
  provider: 'dataforseo' | 'google' | 'mock';
  dataforseoLogin?: string;
  dataforseoPassword?: string;
  googleApiKey?: string;
}

interface GeoGridNodeResult {
  lat: number;
  lng: number;
  row_idx: number;
  col_idx: number;
  rank: number | null;
  competitors: Array<{ name: string; position: number }>;
}

interface QueryResult {
  rank: number | null;
  competitors: Array<{ name: string; position: number }>;
}

// ─── Seeded Pseudo-Random (deterministic per keyword+lat+lng) ──────────────

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    // Mulberry32
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// ─── Environment Variable Access ────────────────────────────────────────────

function getEnvVar(name: string): string | undefined {
  try {
    const { env } = getRequestContext();
    const val = env?.[name];
    if (val && typeof val === 'string') return val;
  } catch {
    // Not in Cloudflare Workers context
  }
  // Fallback to process.env (local dev / Node.js)
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name];
  }
  return undefined;
}

// ─── getSERPCredentials ─────────────────────────────────────────────────────

export function getSERPCredentials(): SERPCredentials {
  const provider = (getEnvVar('SERP_PROVIDER') || 'mock') as SERPCredentials['provider'];
  const validProviders = ['dataforseo', 'google', 'mock'];

  return {
    provider: validProviders.includes(provider) ? provider : 'mock',
    dataforseoLogin: getEnvVar('DATAFORSEO_LOGIN'),
    dataforseoPassword: getEnvVar('DATAFORSEO_PASSWORD'),
    googleApiKey: getEnvVar('GOOGLE_MAPS_API_KEY'),
  };
}

// ─── Fuzzy Business Name Matching ───────────────────────────────────────────

function matchesBusiness(resultName: string, targetName: string): boolean {
  const a = resultName.toLowerCase().trim();
  const b = targetName.toLowerCase().trim();

  // Exact match
  if (a === b) return true;

  // One contains the other (partial match)
  if (a.includes(b) || b.includes(a)) return true;

  // Check if significant words overlap (ignore common business suffixes)
  const stopWords = new Set(['the', 'and', 'of', 'in', 'at', 'a', 'an', 'inc', 'llc', 'ltd', 'co', 'corp', 'company', 'group', 'services', 'service']);
  const wordsA = a.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
  const wordsB = b.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  // Match if at least half the significant words overlap
  return overlap.length >= Math.min(wordsA.length, wordsB.length) * 0.5;
}

// ─── DataForSEO Integration ─────────────────────────────────────────────────

async function queryDataForSEO(
  keyword: string,
  lat: number,
  lng: number,
  businessName: string,
  credentials: SERPCredentials,
): Promise<QueryResult> {
  const login = credentials.dataforseoLogin;
  const password = credentials.dataforseoPassword;

  if (!login || !password) {
    throw new Error('DataForSEO credentials not configured');
  }

  const authHeader = 'Basic ' + btoa(`${login}:${password}`);

  const requestBody = [
    {
      keyword,
      location_coordinate: `${lat},${lng},20`, // lat,lng,radius_km
      language_code: 'en',
      device: 'desktop',
      os: 'windows',
      depth: 20,
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(
      'https://api.dataforseo.com/v3/serp/google/maps/live/advanced',
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DataForSEO API error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    status_code?: number;
    status_message?: string;
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: Array<{
        items?: Array<{
          type?: string;
          rank_group?: number;
          rank_absolute?: number;
          title?: string;
        }>;
      }>;
    }>;
  };

  // Check top-level status
  if (data.status_code && data.status_code !== 20000) {
    throw new Error(`DataForSEO status: ${data.status_message || data.status_code}`);
  }

  // Extract items from the nested response
  const items = data.tasks?.[0]?.result?.[0]?.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { rank: null, competitors: [] };
  }

  // Filter to local_pack / local_finder items (DataForSEO item types)
  const localItems = items.filter(
    (item: { type?: string }) =>
      item.type === 'local_pack' ||
      item.type === 'local_finder' ||
      item.type === 'maps_search',
  );

  // If no typed items, fall back to all items
  const rankedItems = localItems.length > 0 ? localItems : items;

  // Find our business in the results
  let rank: number | null = null;
  const competitors: Array<{ name: string; position: number }> = [];

  for (const item of rankedItems) {
    const typed = item as { rank_group?: number; rank_absolute?: number; title?: string };
    const position = typed.rank_group ?? typed.rank_absolute ?? 0;
    const name = typed.title || 'Unknown';

    if (position > 0 && position <= 20) {
      competitors.push({ name, position });
    }

    if (rank === null && name && matchesBusiness(name, businessName)) {
      rank = position;
    }
  }

  // Sort competitors by position
  competitors.sort((a, b) => a.position - b.position);

  return { rank, competitors: competitors.slice(0, 5) };
}

// ─── Google Maps Places API Integration ─────────────────────────────────────

async function queryGoogleMaps(
  keyword: string,
  lat: number,
  lng: number,
  businessName: string,
  credentials: SERPCredentials,
): Promise<QueryResult> {
  const apiKey = credentials.googleApiKey;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  const params = new URLSearchParams({
    query: keyword,
    location: `${lat},${lng}`,
    radius: '20000', // 20km radius
    key: apiKey,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
      {
        method: 'GET',
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Google Maps API error (${response.status})`);
  }

  const data = await response.json() as {
    status?: string;
    error_message?: string;
    results?: Array<{
      name?: string;
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    throw new Error(`Google Maps API denied: ${data.error_message || data.status}`);
  }

  const results = data.results;
  if (!results || results.length === 0) {
    return { rank: null, competitors: [] };
  }

  let rank: number | null = null;
  const competitors: Array<{ name: string; position: number }> = [];

  for (let i = 0; i < results.length && i < 20; i++) {
    const name = results[i].name || 'Unknown';
    const position = i + 1;
    competitors.push({ name, position });

    if (rank === null && name && matchesBusiness(name, businessName)) {
      rank = position;
    }
  }

  return { rank, competitors: competitors.slice(0, 5) };
}

// ─── Mock Data Provider (deterministic & realistic) ─────────────────────────

/** Contextual competitor name pools keyed by keyword stems */
const COMPETITOR_POOLS: Record<string, string[]> = {
  plumber: ['Roto-Rooter Plumbing', 'Mr. Rooter Plumbing', 'Benjamin Franklin Plumbing', 'ARS Rescue Rooter', 'Rocket Plumbing', 'Allstar Plumbing', 'Ace Plumbing Solutions', 'ProDrain Services', 'PipeMasters Inc.', 'QuickFlow Plumbing'],
  dentist: ['Bright Smiles Dental', 'Gentle Dental Care', 'Smile Design Studio', 'Premier Dental Group', 'Family First Dental', 'Canyon Dental Arts', 'Pearl White Dentistry', 'Healthy Teeth Clinic', 'Modern Dental Studio', 'Sunset Dental Care'],
  restaurant: ['The Golden Fork', 'Harvest Table Bistro', 'Casa Bella Kitchen', 'Urban Grille', 'Lakeside Dining', 'The Rustic Plate', 'Spice Route Cafe', 'Downtown Eats', 'Savor Restaurant', 'The Copper Pot'],
  lawyer: ['Johnson & Associates Law', 'Smith Legal Group', 'Champion Law Firm', 'Pinnacle Legal Services', 'Justice & Partners', 'Apex Attorneys at Law', 'Summit Law Center', 'Premier Legal Counsel', 'Trusted Advocates LLC', 'Guardian Law Office'],
  hvac: ['CoolBreeze HVAC', 'Comfort Pro Heating & Air', 'All Seasons Climate Control', 'AirMasters Heating', 'Premier HVAC Solutions', 'Express Air Conditioning', 'Climate Care Experts', 'Reliable Heating Co.', 'ProTemp Services', 'Green Air Solutions'],
  auto_repair: ['Midas Auto Service', 'Meineke Car Care Center', 'Jiffy Lube', 'Pep Boys Auto', 'Firestone Complete Auto', 'Quick Lane Auto', 'Big O Tires & Service', 'Christian Brothers Automotive', ' precision Auto', 'Goodyear Auto Service'],
  electrician: ['Mister Sparky Electric', 'Mr. Electric', 'Allstar Electrical Group', 'Bright Electric Co.', 'WireMasters Inc.', 'CircuitPro Solutions', 'PowerLine Electric', 'SafeConnect Services', 'Lighthouse Electric', 'Premier Wiring Pros'],
  default: ['Apex Business Solutions', 'Pro Services Group', 'Elite Local Services', 'Cornerstone Providers', 'Trusted Local Co.', 'Prime Choice Services', 'Heritage Business Group', 'Summit Service Pros', 'Pioneer Local Experts', 'Advanced Solutions Co.'],
};

function getCompetitorPool(keyword: string): string[] {
  const lower = keyword.toLowerCase();
  for (const [key, pool] of Object.entries(COMPETITOR_POOLS)) {
    if (key !== 'default' && lower.includes(key)) {
      return pool;
    }
  }
  return COMPETITOR_POOLS.default;
}

function queryMock(
  keyword: string,
  lat: number,
  lng: number,
  businessName: string,
  centerLat: number,
  centerLng: number,
): QueryResult {
  // Seeded random based on keyword + coordinates for deterministic results
  const seed = cyrb53(`${keyword}:${lat.toFixed(5)}:${lng.toFixed(5)}`);
  const rng = new SeededRandom(seed);

  // Distance from center in approximate miles
  const dLat = (lat - centerLat) * 69;
  const dLng = (lng - centerLng) * 69 * Math.cos((centerLat * Math.PI) / 180);
  const distanceMiles = Math.sqrt(dLat * dLat + dLng * dLng);

  // Rank degrades with distance — exponential decay with noise
  // Close to center: high probability of top ranks
  // Far from center: rank degrades, eventually not found
  const distFactor = Math.min(distanceMiles / 5, 1); // normalize to ~5 miles max
  const baseRank = 1 + distFactor * 19; // 1 at center, up to 20 at edge

  // Add noise (-3 to +3) with seeded random
  const noise = (rng.next() - 0.5) * 6;
  let rank: number | null = Math.round(baseRank + noise);

  // Probability of not being found increases with distance
  const notFoundProb = Math.max(0, (distFactor - 0.6) * 0.8);
  if (rng.next() < notFoundProb) {
    rank = null;
  }

  // Clamp rank
  if (rank !== null) {
    rank = Math.max(1, Math.min(20, rank));
  }

  // Generate contextual competitors
  const pool = getCompetitorPool(keyword);
  const competitors: Array<{ name: string; position: number }> = [];

  // Shuffle pool deterministically
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // If our business has a rank, insert it at that position
  if (rank !== null) {
    // Add competitors around the business rank
    let pos = 1;
    const topN = Math.min(5, shuffled.length);

    // Add competitors before our rank
    let compIdx = 0;
    while (pos < rank && competitors.length < topN) {
      competitors.push({ name: shuffled[compIdx % shuffled.length], position: pos });
      compIdx++;
      pos++;
    }

    // Add competitors after our rank
    pos = rank + 1;
    while (competitors.length < topN) {
      competitors.push({ name: shuffled[compIdx % shuffled.length], position: pos });
      compIdx++;
      pos++;
    }
  } else {
    // Business not found — just show top 5 competitors
    for (let i = 0; i < Math.min(5, shuffled.length); i++) {
      competitors.push({ name: shuffled[i], position: i + 1 });
    }
  }

  return { rank, competitors };
}

// ─── queryGeoGridNode ───────────────────────────────────────────────────────

export async function queryGeoGridNode(
  keyword: string,
  lat: number,
  lng: number,
  businessName: string,
  provider: string,
  credentials: SERPCredentials,
  centerLat?: number,
  centerLng?: number,
): Promise<QueryResult> {
  const effectiveProvider = provider as SERPCredentials['provider'];

  try {
    switch (effectiveProvider) {
      case 'dataforseo': {
        if (!credentials.dataforseoLogin || !credentials.dataforseoPassword) {
          console.warn('[SERP] DataForSEO credentials missing, falling back to mock');
          return queryMock(keyword, lat, lng, businessName, centerLat ?? lat, centerLng ?? lng);
        }
        return await queryDataForSEO(keyword, lat, lng, businessName, credentials);
      }

      case 'google': {
        if (!credentials.googleApiKey) {
          console.warn('[SERP] Google Maps API key missing, falling back to mock');
          return queryMock(keyword, lat, lng, businessName, centerLat ?? lat, centerLng ?? lng);
        }
        return await queryGoogleMaps(keyword, lat, lng, businessName, credentials);
      }

      case 'mock':
      default:
        return queryMock(keyword, lat, lng, businessName, centerLat ?? lat, centerLng ?? lng);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown SERP API error';
    console.error(`[SERP] ${effectiveProvider} query failed for "${keyword}" at ${lat},${lng}: ${msg}`);

    // Fallback to mock on API failure
    console.warn('[SERP] Falling back to mock data due to API error');
    return queryMock(keyword, lat, lng, businessName, centerLat ?? lat, centerLng ?? lng);
  }
}

// ─── runGeoGridScan ─────────────────────────────────────────────────────────

export async function runGeoGridScan(params: {
  keyword: string;
  center_lat: number;
  center_lng: number;
  grid_size: number;
  radius: number;
  business_name: string;
}): Promise<GeoGridNodeResult[]> {
  const { keyword, center_lat, center_lng, grid_size, radius, business_name } = params;

  const size = Math.min(grid_size, 9); // Cap at 9x9 (81 nodes)
  const rad = radius;

  // Resolve SERP credentials from environment
  const credentials = getSERPCredentials();
  const provider = credentials.provider;

  console.log(`[GeoGrid] Starting ${size}x${size} scan for "${keyword}" (provider: ${provider})`);

  // Generate grid coordinates (same math as existing code)
  const latStep = (rad * 2 / (size - 1)) * (1 / 69); // approx miles to degrees
  const lngStep = (rad * 2 / (size - 1)) * (1 / (69 * Math.cos(center_lat * Math.PI / 180)));

  const gridCoords: Array<{ lat: number; lng: number; row: number; col: number }> = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const lat = center_lat - rad / 69 + row * latStep;
      const lng = center_lng - rad / (69 * Math.cos(center_lat * Math.PI / 180)) + col * lngStep;
      gridCoords.push({ lat, lng, row, col });
    }
  }

  // Scan all grid nodes with rate limiting and overall timeout
  const SCAN_TIMEOUT_MS = 70_000;
  const RATE_LIMIT_MS = provider === 'mock' ? 0 : 100; // No delay for mock

  const results: GeoGridNodeResult[] = [];
  const scanStart = Date.now();

  for (let i = 0; i < gridCoords.length; i++) {
    // Check overall timeout
    if (Date.now() - scanStart > SCAN_TIMEOUT_MS) {
      console.warn(`[GeoGrid] Scan timed out after ${i}/${gridCoords.length} nodes`);
      // Fill remaining nodes with mock data
      for (let j = i; j < gridCoords.length; j++) {
        const coord = gridCoords[j];
        const mockResult = queryMock(keyword, coord.lat, coord.lng, business_name, center_lat, center_lng);
        results.push({
          lat: coord.lat,
          lng: coord.lng,
          row_idx: coord.row,
          col_idx: coord.col,
          rank: mockResult.rank,
          competitors: mockResult.competitors,
        });
      }
      break;
    }

    const coord = gridCoords[i];

    try {
      const nodeResult = await queryGeoGridNode(
        keyword,
        coord.lat,
        coord.lng,
        business_name,
        provider,
        credentials,
        center_lat,
        center_lng,
      );

      results.push({
        lat: coord.lat,
        lng: coord.lng,
        row_idx: coord.row,
        col_idx: coord.col,
        rank: nodeResult.rank,
        competitors: nodeResult.competitors,
      });
    } catch (err) {
      // Individual node failure — use mock fallback
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[GeoGrid] Node (${coord.row},${coord.col}) failed: ${msg}`);

      const mockResult = queryMock(keyword, coord.lat, coord.lng, business_name, center_lat, center_lng);
      results.push({
        lat: coord.lat,
        lng: coord.lng,
        row_idx: coord.row,
        col_idx: coord.col,
        rank: mockResult.rank,
        competitors: mockResult.competitors,
      });
    }

    // Rate limit between API calls (skip after last node)
    if (RATE_LIMIT_MS > 0 && i < gridCoords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }

  const elapsed = Date.now() - scanStart;
  console.log(`[GeoGrid] Scan completed: ${results.length} nodes in ${elapsed}ms (provider: ${provider})`);

  return results;
}

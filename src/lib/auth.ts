// Auth utilities compatible with Cloudflare Edge Runtime
// Uses Web Crypto API (no bcrypt/Node.js crypto)

const JWT_SECRET_KEY = 'siloforge-jwt-secret-2024-secure';

// ===== Password Hashing =====

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || crypto.randomUUID().replace(/-/g, '');
  const encoder = new TextEncoder();
  const data = encoder.encode(useSalt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt: useSalt };
}

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

// ===== JWT =====

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getSigningKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createToken(payload: { userId: string; email: string; role: string }): Promise<string> {
  const key = await getSigningKey();
  const encoder = new TextEncoder();

  const header = arrayBufferToBase64(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer);
  const body = arrayBufferToBase64(encoder.encode(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 })).buffer);

  const signatureInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureInput));
  const signatureB64 = arrayBufferToBase64(signature);

  return `${signatureInput}.${signatureB64}`;
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string; role: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const key = await getSigningKey();
    const encoder = new TextEncoder();

    const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
    const expectedSigB64 = arrayBufferToBase64(expectedSig);

    if (signature !== expectedSigB64) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64ToArrayBuffer(body)));
    if (payload.exp && payload.exp < Date.now()) return null;

    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

// ===== Extract user from request =====

export async function getUserFromRequest(req: Request): Promise<{ userId: string; email: string; role: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return verifyToken(authHeader.slice(7));
  }

  // Also check cookie
  const cookie = req.headers.get('cookie') || '';
  const tokenMatch = cookie.match(/siloforge_token=([^;]+)/);
  if (tokenMatch) {
    return verifyToken(tokenMatch[1]);
  }

  return null;
}

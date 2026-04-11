import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Authenticated fetch wrapper that automatically adds the Authorization header
 * if a token is available. Returns a Response object just like native fetch.
 * If the token is null/undefined, the request proceeds without auth headers
 * (the backend will return 401 if auth is required).
 */
export function authFetch(url: string | URL | globalThis.Request, token: string | null, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options?.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, headers });
}

/**
 * Sanitize HTML to prevent XSS attacks while preserving safe formatting tags.
 * Strips <script>, <iframe>, <object>, <embed>, <form>, and dangerous event handlers.
 */
export function sanitizeHTML(html: string): string {
  if (!html) return '';
  return html
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove dangerous tags
    .replace(/<\/?(?:script|iframe|object|embed|applet|form|input|textarea|select|button|meta|link|base)\b[^>]*>/gi, '')
    // Remove event handlers (on* attributes)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Remove javascript: URLs
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"')
    // Remove srcdoc attributes
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Remove data: URLs in src (can embed scripts)
    .replace(/src\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, '');
}

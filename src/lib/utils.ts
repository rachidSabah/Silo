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
    // Remove <body> tags — AI sometimes wraps output in <body> with white background
    .replace(/<body\b[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    // Remove <html> and <head> tags
    .replace(/<html\b[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    // Remove <style> blocks — AI-generated CSS (like body{background:white}) breaks dark mode
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove <font> tags — legacy HTML with color/bgcolor attributes
    .replace(/<font\b[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    // Remove bgcolor attributes on any element (e.g., <table bgcolor="white">)
    .replace(/\s+bgcolor\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Remove text, link, vlink, alink attributes (body-style color attributes on any element)
    .replace(/\s+(?:text|link|vlink|alink)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove dangerous tags
    .replace(/<\/?(?:script|iframe|object|embed|applet|form|input|textarea|select|button|meta|link|base)\b[^>]*>/gi, '')
    // Remove inline style attributes — AI-generated styles (like color: #000, background: white)
    // conflict with the dark-mode .article-content CSS and cause invisible text
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Remove event handlers (on* attributes)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Remove javascript: URLs
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"')
    // Remove srcdoc attributes
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Remove data: URLs in src (can embed scripts)
    .replace(/src\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, '');
}

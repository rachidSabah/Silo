import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

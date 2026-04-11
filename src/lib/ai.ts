// AI abstraction supporting multiple providers: OpenAI, Google Gemini, Anthropic Claude, DeepSeek
// Uses API keys stored in user settings (D1 database)

import { getActiveAISetting } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

// Re-export for convenience
export { AI_PROVIDERS } from '@/lib/ai-providers';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callOpenAI(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Map deprecated Gemini model names to current ones
const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-pro': 'gemini-2.0-flash',
  // 1.5 models still work but map to latest equivalents for better quality
  'gemini-1.5-pro': 'gemini-2.5-pro-preview-05-06',
  'gemini-1.5-flash': 'gemini-2.0-flash',
  'gemini-1.5-flash-8b': 'gemini-2.0-flash-lite',
  // Short aliases
  'gemini-2.5-pro': 'gemini-2.5-pro-preview-05-06',
  'gemini-2.5-flash': 'gemini-2.5-flash-preview-05-20',
};

async function callGemini(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const safeModel = GEMINI_MODEL_MAP[model] || model;
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7 } }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callClaude(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  // Claude API expects system message separately
  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemMsg,
      messages: chatMsgs,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callDeepSeek(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  // DeepSeek reasoner model may put output in reasoning_content
  const content = data.choices?.[0]?.message?.content || '';
  const reasoning = data.choices?.[0]?.message?.reasoning_content || '';
  return content || reasoning;
}

// Main AI call function - resolves provider from user settings
export async function callAI(messages: ChatMessage[], req?: NextRequest): Promise<string> {
  // Try to get user's active AI setting from the request's auth token
  if (req) {
    const user = await getUserFromRequest(req);
    if (user) {
      const setting = await getActiveAISetting(user.userId);
      if (setting && setting.api_key) {
        const { provider, api_key, model } = setting;
        switch (provider) {
          case 'openai':
            return await callOpenAI(api_key, model || 'gpt-4o-mini', messages);
          case 'gemini':
            return await callGemini(api_key, model || 'gemini-2.0-flash', messages);
          case 'claude':
            return await callClaude(api_key, model || 'claude-sonnet-4-20250514', messages);
          case 'deepseek':
            return await callDeepSeek(api_key, model || 'deepseek-chat', messages);
          default:
            throw new Error(`Unknown AI provider: ${provider}. Please check your AI settings.`);
        }
      } else {
        throw new Error('No active AI provider configured. Please add an API key in Admin > AI Settings.');
      }
    } else {
      throw new Error('Not authenticated. Please log in to use AI features.');
    }
  }

  throw new Error('No request context available. Cannot determine AI provider.');
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const cleaned = cleanAIResponse(text);
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch {
    return fallback;
  }
}

// Robustly extract JSON from AI text that may contain extra commentary
function cleanAIResponse(text: string): string {
  // First try: strip markdown code fences
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Try direct parse
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // Second try: find the first '{' and last '}' for object, or '[' and ']' for array
  // This handles cases where AI adds text before/after JSON
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    // Try to extract JSON object
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = firstBrace; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(firstBrace, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { break; }
      }
    }
  }

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    // Try to extract JSON array
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = firstBracket; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch === ']') depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(firstBracket, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { break; }
      }
    }
  }

  // Last resort: remove common AI preamble patterns
  cleaned = cleaned.replace(/^(Here\s+(is|are)|Below\s+(is|are)|Sure[!,]?|I'll|I\s+will|Certainly[!,]?|Of\s+course[!,]?)\s[\s\S]*?(?=\{)/i, '{');
  cleaned = cleaned.replace(/\}[\s\S]*$/, '}');

  return cleaned;
}

// Extract an array from AI response, handling both raw array and wrapped object formats
function extractArray<T>(text: string, arrayKey: string, fallback: T[]): T[] {
  try {
    const cleaned = cleanAIResponse(text);
    const parsed = JSON.parse(cleaned);
    // If it's already an array, return it
    if (Array.isArray(parsed)) return parsed;
    // If it's an object with the key, extract it
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed[arrayKey])) return parsed[arrayKey];
    // If it's an object with any array property, try the first one
    if (parsed && typeof parsed === 'object') {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val)) return val as T[];
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// Extract a Record<string, array> from AI response for page generation
// Handles: {siloName: [...]} directly, or {pagesBySilo: {...}}, {pages: {...}}, etc.
// Also handles nested structures like {siloName: {pillar: {...}, clusters: [...], blogs: [...]}}
function extractPagesBySilo(
  text: string,
  silos: { name: string; keywords: string[] }[]
): Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> {
  try {
    const cleaned = cleanAIResponse(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[extractPagesBySilo] JSON parse failed:', e instanceof Error ? e.message : e, 'Text preview:', cleaned.slice(0, 300));
      return {};
    }

    if (!parsed || typeof parsed !== 'object') return {};

    // If it's an array, we can't directly map it to silos - return empty (handled by caller fallback)
    if (Array.isArray(parsed)) return {};

    // Check common wrapper keys first
    for (const key of ['pagesBySilo', 'pages', 'silos', 'data', 'result']) {
      if ((parsed as Record<string, unknown>)[key] && typeof (parsed as Record<string, unknown>)[key] === 'object' && !Array.isArray((parsed as Record<string, unknown>)[key])) {
        const inner = (parsed as Record<string, unknown>)[key] as Record<string, unknown>;
        const flattened = flattenSiloEntries(inner, silos);
        if (Object.keys(flattened).length > 0) return flattened;
      }
    }

    // Check if parsed itself is {siloName: [...]} directly
    const siloNames = new Set(silos.map(s => s.name));
    const entries = Object.entries(parsed as Record<string, unknown>);
    const matchingEntries = entries.filter(([key, val]) =>
      siloNames.has(key) ||
      (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'title' in (val[0] as Record<string, unknown>)) ||
      (typeof val === 'object' && val !== null && !Array.isArray(val))
    );
    if (matchingEntries.length > 0) {
      const flattened = flattenSiloEntries(Object.fromEntries(matchingEntries), silos);
      if (Object.keys(flattened).length > 0) return flattened;
    }

    // Last resort: find any property whose value is an object with array values
    for (const [key, val] of entries) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const inner = val as Record<string, unknown>;
        const hasValidContent = Object.values(inner).some(v => Array.isArray(v) || (typeof v === 'object' && v !== null && !Array.isArray(v)));
        if (hasValidContent) {
          const flattened = flattenSiloEntries(inner, silos);
          if (Object.keys(flattened).length > 0) return flattened;
        }
      }
    }

    // Ultra-last resort: scan ALL keys recursively for any array containing objects with 'title'
    const deepPages = deepExtractPages(parsed as Record<string, unknown>, silos);
    if (Object.keys(deepPages).length > 0) return deepPages;

    console.error('[extractPagesBySilo] No valid page data found in parsed object. Keys:', Object.keys(parsed as Record<string, unknown>));
    return {};
  } catch (e) {
    console.error('[extractPagesBySilo] Unexpected error:', e instanceof Error ? e.message : e);
    return {};
  }
}

// Deep recursive extraction: find any arrays containing objects with 'title' field anywhere in the structure
function deepExtractPages(
  obj: Record<string, unknown>,
  silos: { name: string; keywords: string[] }[]
): Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> {
  const result: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
  const siloNames = new Set(silos.map(s => s.name));

  function scan(current: unknown, parentKey: string, depth: number): void {
    if (depth > 5) return; // Prevent infinite recursion
    if (!current || typeof current !== 'object') return;

    if (Array.isArray(current)) {
      // Check if this array contains page-like objects
      if (current.length > 0 && current[0] && typeof current[0] === 'object' && 'title' in (current[0] as Record<string, unknown>)) {
        // Determine which silo this belongs to
        const siloKey = parentKey || silos[0]?.name || 'Default';
        if (!result[siloKey]) result[siloKey] = [];
        for (const item of current) {
          if (item && typeof item === 'object' && 'title' in (item as Record<string, unknown>)) {
            const page = item as Record<string, unknown>;
            result[siloKey].push({
              title: (page.title as string) || '',
              slug: (page.slug as string) || ((page.title as string) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              meta_description: (page.meta_description as string) || (page.metaDescription as string) || '',
              keywords: Array.isArray(page.keywords) ? page.keywords as string[] : [],
              type: inferPageType(parentKey, page.type as string),
            });
          }
        }
      }
      return;
    }

    // It's a plain object - recurse into its values
    for (const [key, val] of Object.entries(current as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        scan(val, key, depth + 1);
      }
    }
  }

  scan(obj, '', 0);

  // Try to match result keys to actual silo names
  const mapped: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
  for (const [key, pages] of Object.entries(result)) {
    if (siloNames.has(key) || pages.length > 0) {
      mapped[key] = pages;
    }
  }

  return mapped;
}

// Flatten nested silo structures like {pillar: {...}, clusters: [...], blogs: [...]} into a flat array
function flattenSiloEntries(
  obj: Record<string, unknown>,
  silos: { name: string; keywords: string[] }[]
): Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> {
  const result: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
  const siloNames = new Set(silos.map(s => s.name));

  for (const [siloKey, siloVal] of Object.entries(obj)) {
    // Skip known non-data keys
    if (['pagesBySilo', 'pages', 'silos', 'data', 'result', 'error', 'ok'].includes(siloKey)) continue;

    // If it's already a flat array of page objects
    if (Array.isArray(siloVal) && siloVal.length > 0) {
      if (siloVal[0] && typeof siloVal[0] === 'object' && siloVal[0] !== null && 'title' in (siloVal[0] as Record<string, unknown>)) {
        result[siloKey] = siloVal as { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[];
        continue;
      }
    }

    // If it's a nested object like {pillar: {...}, clusters: [...], blogs: [...]}
    if (siloVal && typeof siloVal === 'object' && !Array.isArray(siloVal)) {
      const nested = siloVal as Record<string, unknown>;
      const pages: { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[] = [];

      for (const [subKey, subVal] of Object.entries(nested)) {
        // Handle single pillar object: {pillar: {title, slug, ...}}
        if (subVal && typeof subVal === 'object' && !Array.isArray(subVal) && 'title' in (subVal as Record<string, unknown>)) {
          const page = subVal as Record<string, unknown>;
          pages.push({
            title: (page.title as string) || '',
            slug: (page.slug as string) || ((page.title as string) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            meta_description: (page.meta_description as string) || (page.metaDescription as string) || '',
            keywords: Array.isArray(page.keywords) ? page.keywords as string[] : [],
            type: inferPageType(subKey, page.type as string),
          });
        }
        // Handle arrays: {clusters: [{title, ...}, ...]}
        if (Array.isArray(subVal)) {
          for (const item of subVal) {
            if (item && typeof item === 'object' && 'title' in (item as Record<string, unknown>)) {
              const page = item as Record<string, unknown>;
              pages.push({
                title: (page.title as string) || '',
                slug: (page.slug as string) || ((page.title as string) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                meta_description: (page.meta_description as string) || (page.metaDescription as string) || '',
                keywords: Array.isArray(page.keywords) ? page.keywords as string[] : [],
                type: inferPageType(subKey, page.type as string),
              });
            }
          }
        }
      }

      if (pages.length > 0) {
        result[siloKey] = pages;
      }
    }
  }

  return result;
}

// Infer page type from key name (pillar, cluster, blog) or from explicit type field
function inferPageType(key: string, explicitType?: string): string {
  if (explicitType && ['pillar', 'cluster', 'blog', 'category', 'landing'].includes(explicitType)) {
    return explicitType;
  }
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('pillar')) return 'pillar';
  if (lowerKey.includes('cluster')) return 'cluster';
  if (lowerKey.includes('blog')) return 'blog';
  if (lowerKey.includes('category')) return 'category';
  if (lowerKey.includes('landing')) return 'landing';
  return explicitType || 'blog';
}

export async function expandKeywords(seedKeywords: string[], niche: string, language: string, req?: NextRequest): Promise<string[]> {
  const safeKeywords = Array.isArray(seedKeywords) ? seedKeywords : [niche || 'seo'].filter(Boolean);
  const content = await callAI([
    { role: 'system', content: `You are an SEO keyword research expert. Given seed keywords, expand them into a comprehensive list of related keywords and long-tail variations. Return ONLY a JSON array of strings, no other text. Language: ${language}.` },
    { role: 'user', content: `Expand these seed keywords for the niche "${niche}": ${safeKeywords.join(', ')}. Return 30-50 related keywords as a JSON array.` },
  ], req);
  return extractArray<string>(content, 'keywords', safeKeywords);
}

export async function generateSilos(niche: string, keywords: string[], language: string, req?: NextRequest): Promise<{ name: string; keywords: string[] }[]> {
  const safeKeywords = Array.isArray(keywords) ? keywords : [niche || 'seo'].filter(Boolean);
  const content = await callAI([
    { role: 'system', content: `You are an SEO architect specializing in website silo structure. Given a niche and keywords, suggest optimal content silo categories. Each silo should group related topics together. Return ONLY a JSON array of objects with "name" (silo name) and "keywords" (array of keywords for that silo). No other text. Language: ${language}.` },
    { role: 'user', content: `Generate 4-8 silo categories for the niche "${niche}" with these keywords: ${safeKeywords.join(', ')}. Return as JSON array.` },
  ], req);
  return extractArray<{ name: string; keywords: string[] }>(content, 'silos', [{ name: niche, keywords: safeKeywords }]);
}

export async function generatePages(
  silos: { name: string; keywords: string[] }[],
  niche: string,
  language: string,
  req?: NextRequest
): Promise<Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]>> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO content strategist. Given silo categories and their keywords, generate a comprehensive page structure for each silo. Each silo should have:
- 1 pillar page (comprehensive guide, type "pillar")
- 2-4 cluster pages (in-depth subtopics, type "cluster")
- 2-4 blog posts (type "blog")

Return ONLY a JSON object where keys are silo names and values are arrays of page objects. Each page object must have: "title", "slug" (URL-friendly, lowercase, hyphens), "meta_description" (150-160 chars), "keywords" (array of 3-5 keywords), "type" (pillar|cluster|blog). No other text. Language: ${language}.` },
    { role: 'user', content: `Generate pages for silos in niche "${niche}":\n${silos.map(s => `Silo: ${s.name} - Keywords: ${s.keywords.join(', ')}`).join('\n')}` },
  ], req);

  console.log('[generatePages] AI raw response length:', content.length, 'first 500 chars:', content.slice(0, 500));

  const result = extractPagesBySilo(content, silos);
  console.log('[generatePages] Extracted keys:', Object.keys(result), 'total pages:', Object.values(result).reduce((sum, arr) => sum + arr.length, 0));

  // If extractPagesBySilo returned empty, try a more aggressive fallback
  if (Object.keys(result).length === 0) {
    console.log('[generatePages] extractPagesBySilo returned empty, trying fallback parse...');
    try {
      const cleaned = cleanAIResponse(content);
      const parsed = JSON.parse(cleaned);
      console.log('[generatePages] Fallback parse succeeded, type:', typeof parsed, Array.isArray(parsed), 'keys:', Object.keys(parsed).slice(0, 10));

      // If it's an array of objects with silo info
      if (Array.isArray(parsed)) {
        // Maybe it's a flat array of pages with a silo_name field
        const bySilo: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
        for (const item of parsed) {
          if (item && typeof item === 'object' && 'title' in item && item.title) {
            const siloKey = (item as Record<string, unknown>).silo_name || (item as Record<string, unknown>).siloName || (item as Record<string, unknown>).silo || silos[0]?.name || 'Default';
            if (!bySilo[siloKey as string]) bySilo[siloKey as string] = [];
            bySilo[siloKey as string].push({
              title: item.title as string,
              slug: (item.slug as string) || (item.title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              meta_description: (item.meta_description as string) || (item.metaDescription as string) || '',
              keywords: Array.isArray(item.keywords) ? item.keywords as string[] : [],
              type: (item.type as string) || 'blog',
            });
          }
        }
        if (Object.keys(bySilo).length > 0) {
          console.log('[generatePages] Fallback array-to-silo succeeded, keys:', Object.keys(bySilo));
          return bySilo;
        }
      }

      // If it's an object but keys don't match silo names, try to match by page content
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Try every key that has an array value
        const bySilo: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
        for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
          if (Array.isArray(val) && val.length > 0 && val[0] && typeof val[0] === 'object' && 'title' in (val[0] as Record<string, unknown>)) {
            bySilo[key] = val as { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[];
          }
          // If the value is an object with a 'pages' array
          if (val && typeof val === 'object' && !Array.isArray(val) && (val as Record<string, unknown>).pages && Array.isArray((val as Record<string, unknown>).pages)) {
            bySilo[key] = (val as Record<string, unknown>).pages as { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[];
          }
          // If the value is an object with nested page arrays (like {pillar: {...}, clusters: [...], blogs: [...]})
          if (val && typeof val === 'object' && !Array.isArray(val) && !(val as Record<string, unknown>).pages) {
            const nested = val as Record<string, unknown>;
            const pages: { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[] = [];
            for (const [subKey, subVal] of Object.entries(nested)) {
              if (subVal && typeof subVal === 'object' && !Array.isArray(subVal) && 'title' in (subVal as Record<string, unknown>)) {
                const page = subVal as Record<string, unknown>;
                pages.push({
                  title: (page.title as string) || '',
                  slug: (page.slug as string) || ((page.title as string) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                  meta_description: (page.meta_description as string) || (page.metaDescription as string) || '',
                  keywords: Array.isArray(page.keywords) ? page.keywords as string[] : [],
                  type: inferPageType(subKey, page.type as string),
                });
              }
              if (Array.isArray(subVal)) {
                for (const item of subVal) {
                  if (item && typeof item === 'object' && 'title' in (item as Record<string, unknown>)) {
                    const page = item as Record<string, unknown>;
                    pages.push({
                      title: (page.title as string) || '',
                      slug: (page.slug as string) || ((page.title as string) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                      meta_description: (page.meta_description as string) || (page.metaDescription as string) || '',
                      keywords: Array.isArray(page.keywords) ? page.keywords as string[] : [],
                      type: inferPageType(subKey, page.type as string),
                    });
                  }
                }
              }
            }
            if (pages.length > 0) {
              bySilo[key] = pages;
            }
          }
        }
        if (Object.keys(bySilo).length > 0) {
          console.log('[generatePages] Fallback object-with-arrays succeeded, keys:', Object.keys(bySilo));
          return bySilo;
        }
      }

      // Ultra fallback: if we have any data, try to create pages from it
      console.error('[generatePages] All fallbacks failed. Raw response type:', typeof parsed, 'preview:', JSON.stringify(parsed).slice(0, 500));
    } catch (e) {
      console.error('[generatePages] Fallback parse also failed:', e instanceof Error ? e.message : e, 'Raw text preview:', content.slice(0, 300));
    }
  }

  return result;
}

export async function suggestInternalLinks(
  pages: { id: string; title: string; slug: string; type: string; silo_id?: string | null }[],
  silos: { id: string; name: string }[],
  req?: NextRequest
): Promise<{ from: string; to: string; anchor: string }[]> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO internal linking expert. Given a list of pages and their silos, suggest internal links between pages. Prioritize:
1. Links from pillar pages to cluster/blog pages in the same silo
2. Links between related cluster pages
3. Cross-silo links where topics overlap

Return ONLY a JSON array of link objects with "from" (page id), "to" (page id), and "anchor" (link anchor text). No other text.` },
    { role: 'user', content: `Suggest internal links for these pages:\n${JSON.stringify(pages.slice(0, 50))}\nSilos: ${JSON.stringify(silos)}` },
  ], req);
  return extractArray<{ from: string; to: string; anchor: string }>(content, 'links', []);
}

// ===== NEW AI FUNCTIONS =====

export interface KeywordCluster {
  name: string;
  keywords: string[];
  intent: 'informational' | 'navigational' | 'transactional' | 'commercial';
  searchVolume?: string;
  difficulty?: string;
}

export async function groupKeywords(
  keywords: string[],
  niche: string,
  req?: NextRequest
): Promise<KeywordCluster[]> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO keyword clustering expert. Given a list of keywords, group them into logical clusters based on SERP similarity and topical relevance. For each cluster, determine the primary search intent (informational, navigational, transactional, or commercial). Return ONLY a JSON array of objects with "name" (cluster name), "keywords" (array of grouped keywords), "intent" (one of: informational, navigational, transactional, commercial). No other text.` },
    { role: 'user', content: `Group these keywords for the niche "${niche}" into clusters:\n${keywords.join('\n')}` },
  ], req);
  return extractArray<KeywordCluster>(content, 'clusters', [{ name: niche, keywords, intent: 'informational' }]);
}

export async function mapSearchIntent(
  keywords: string[],
  req?: NextRequest
): Promise<Array<{ keyword: string; intent: 'informational' | 'navigational' | 'transactional' | 'commercial'; funnelStage: string }>> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO search intent expert. For each keyword, determine the primary search intent and funnel stage. Return ONLY a JSON array of objects with "keyword", "intent" (one of: informational, navigational, transactional, commercial), and "funnelStage" (one of: awareness, consideration, decision, retention). No other text.` },
    { role: 'user', content: `Map search intent for these keywords:\n${keywords.join('\n')}` },
  ], req);
  return extractArray<{ keyword: string; intent: 'informational' | 'navigational' | 'transactional' | 'commercial'; funnelStage: string }>(content, 'intents', keywords.map(k => ({ keyword: k, intent: 'informational' as const, funnelStage: 'awareness' })));
}

export async function analyzeContentGap(
  userSilos: { name: string; keywords: string[] }[],
  competitorSilos: { name: string; keywords: string[] }[],
  niche: string,
  req?: NextRequest
): Promise<Array<{ topic: string; keywords: string[]; priority: 'high' | 'medium' | 'low'; suggestedSilo: string }>> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO competitive analysis expert. Compare the user's content silos with a competitor's silos to identify content gaps - topics the competitor covers that the user does not. Return ONLY a JSON array of gap objects with "topic" (missing topic), "keywords" (related keywords), "priority" (high/medium/low based on search demand), and "suggestedSilo" (which of the user's silos this topic fits best). No other text.` },
    { role: 'user', content: `User's silos:\n${JSON.stringify(userSilos)}\n\nCompetitor's silos:\n${JSON.stringify(competitorSilos)}\n\nNiche: ${niche}` },
  ], req);
  return extractArray<{ topic: string; keywords: string[]; priority: 'high' | 'medium' | 'low'; suggestedSilo: string }>(content, 'gaps', []);
}

export interface ContentBrief {
  title: string;
  targetKeywords: string[];
  searchIntent: string;
  contentType: string;
  wordCountTarget: string;
  outline: string[];
  keyPoints: string[];
  internalLinkTargets: string[];
  metaDescription: string;
  callToAction: string;
}

export async function generateContentBrief(
  pageTitle: string,
  pageType: string,
  siloName: string,
  keywords: string[],
  siblingPages: { title: string; type: string }[],
  niche: string,
  req?: NextRequest
): Promise<ContentBrief | null> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO content strategist creating detailed content briefs. Given a page's context within a silo structure, generate a comprehensive content brief. The brief should be tailored to the page's role (pillar pages need comprehensive guides, cluster pages need focused deep-dives, blog posts need engaging content). Return ONLY a JSON object with these fields: "title" (optimized H1), "targetKeywords" (array of 3-5), "searchIntent" (informational/transactional/commercial/navigational), "contentType" (guide/tutorial/listicle/comparison/etc), "wordCountTarget" (e.g., "2000-2500"), "outline" (array of H2 sections), "keyPoints" (array of must-cover points), "internalLinkTargets" (array of suggested pages to link to from this content), "metaDescription" (150-160 chars), "callToAction" (suggested CTA). No other text.` },
    { role: 'user', content: `Generate a content brief for:
- Page Title: ${pageTitle}
- Page Type: ${pageType}
- Silo: ${siloName}
- Keywords: ${keywords.join(', ')}
- Niche: ${niche}
- Sibling pages in silo: ${JSON.stringify(siblingPages)}` },
  ], req);
  // Extract brief from AI response, handling wrapped formats like {brief: {...}}
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    // If AI wrapped it in {brief: {...}}, extract inner
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Check for common wrapper keys
      for (const key of ['brief', 'contentBrief', 'data', 'result']) {
        if (parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
          return parsed[key] as ContentBrief;
        }
      }
      // If parsed itself looks like a ContentBrief (has title field), return it
      if (parsed.title && typeof parsed.title === 'string') {
        return parsed as ContentBrief;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ===== SILO-AWARE CONTENT GENERATION =====

export interface SiloContext {
  siloName: string;
  pillarPage: { title: string; slug: string; keywords: string[] } | null;
  siblingPages: Array<{ title: string; slug: string; type: string; keywords: string[] }>;
  internalLinks: Array<{ anchor: string; targetTitle: string; targetSlug: string }>;
  brandVoice?: string;
  niche: string;
}

export interface GeneratedArticleResult {
  title: string;
  content: string;
  wordCount: number;
  internalLinks: Array<{ anchor: string; targetSlug: string }>;
  metaDescription: string;
}

/**
 * Generate a silo-aware article for a single page.
 * This is the key differentiator: instead of just passing the target keyword,
 * we pass the ENTIRE silo context so the AI knows:
 * - What the pillar page covers (to link up to it)
 * - What sibling pages cover (to avoid duplication/cannibalization)
 * - Specific anchor texts to use for internal links
 * - Brand voice consistency requirements
 */
export async function generateSiloAwareArticle(
  pageTitle: string,
  pageType: string,
  pageKeywords: string[],
  siloContext: SiloContext,
  wordCountTarget: number,
  req?: NextRequest
): Promise<GeneratedArticleResult | null> {
  const { siloName, pillarPage, siblingPages, internalLinks, brandVoice, niche } = siloContext;

  // Build the context-aware prompt
  const siblingContext = siblingPages
    .filter(p => p.title !== pageTitle)
    .map(p => `  - "${p.title}" (${p.type}): covers ${p.keywords.slice(0, 3).join(', ')}`)
    .join('\n');

  const linkContext = internalLinks
    .map(l => `  - Use anchor "${l.anchor}" to link to "${l.targetTitle}" (/${l.targetSlug})`)
    .join('\n');

  const avoidTopics = siblingPages
    .filter(p => p.title !== pageTitle)
    .map(p => p.keywords.slice(0, 2).join(', '))
    .join('; ');

  const systemPrompt = `You are an expert SEO content writer who writes silo-aware articles. Your writing must be tightly integrated with the site's silo architecture to avoid keyword cannibalization and maximize internal link equity flow.

CRITICAL RULES:
1. Write about ${pageTitle}'s specific topic ONLY. Do NOT cover sub-topics that belong to sibling articles (listed below) — this prevents keyword cannibalization.
2. Always include internal links using the EXACT anchor texts provided below. These are strategic links that push authority up to the pillar page and across to sibling pages.
3. If this is a pillar page, write a comprehensive guide. If a cluster page, write a focused deep-dive. If a blog post, write an engaging article.
4. The content must be ${wordCountTarget} words minimum.
5. Use proper HTML formatting: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <a href="/slug">anchor</a> tags.
6. Include a compelling introduction and a clear CTA at the end.
7. ${brandVoice ? `Brand voice: ${brandVoice}.` : 'Use a professional yet approachable tone.'}
8. Optimize for the target keywords naturally — don't stuff them.
9. Return ONLY a JSON object with: "title" (H1), "content" (HTML string), "wordCount" (approximate), "internalLinks" (array of {anchor, targetSlug} for links you included), "metaDescription" (150-160 chars). No other text.`;

  const userPrompt = `Write a ${pageType} page article for the silo "${siloName}" in the niche "${niche}".

PAGE DETAILS:
- Title: ${pageTitle}
- Type: ${pageType}
- Target Keywords: ${pageKeywords.join(', ')}
- Word Count Target: ${wordCountTarget} words

SILO CONTEXT:
${pillarPage ? `- Pillar Page: "${pillarPage.title}" (/${pillarPage.slug}) — keywords: ${pillarPage.keywords.join(', ')}
  → Link UP to this pillar page using relevant anchor text` : '- This IS the pillar page — it should be the authoritative hub for this silo'}

SIBLING PAGES (DO NOT duplicate their topics):
${siblingContext || '- None'}

TOPICS TO AVOID (covered by siblings): ${avoidTopics || 'None'}

INTERNAL LINKS TO INCLUDE:
${linkContext || '- Include at least 2-3 links to other pages in this silo'}

Write the full article now. Return ONLY the JSON object.`;

  const content = await callAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], req);

  // Extract article from AI response, handling wrapped formats like {article: {...}}
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    // If AI wrapped it in {article: {...}}, extract inner
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const key of ['article', 'data', 'result']) {
        if (parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
          return parsed[key] as GeneratedArticleResult;
        }
      }
      // If parsed itself looks like a GeneratedArticleResult (has content field), return it
      if (parsed.content && typeof parsed.content === 'string') {
        return parsed as GeneratedArticleResult;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Bulk generate articles for an entire silo.
 * Generates articles one by one (to maintain context awareness) but in sequence,
 * ensuring each article knows about the others to avoid cannibalization.
 */
export async function bulkGenerateSiloArticles(
  siloName: string,
  niche: string,
  pages: Array<{
    id: string;
    title: string;
    slug: string;
    type: string;
    keywords: string[];
  }>,
  brandVoice: string,
  onProgress?: (current: number, total: number) => void,
  req?: NextRequest
): Promise<Array<GeneratedArticleResult & { pageId: string }>> {
  const results: Array<GeneratedArticleResult & { pageId: string }> = [];

  const pillarPage = pages.find(p => p.type === 'pillar') || null;
  const siblingPagesAll = pages.map(p => ({
    title: p.title,
    slug: p.slug,
    type: p.type,
    keywords: p.keywords,
  }));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const wordCountTarget = page.type === 'pillar' ? 3000 : page.type === 'cluster' ? 2000 : 1500;

    // Build internal links context — link to pillar and siblings
    const internalLinks: Array<{ anchor: string; targetTitle: string; targetSlug: string }> = [];

    // Link to pillar page from non-pillar pages
    if (pillarPage && page.id !== pillarPage.id) {
      const anchorOptions = pillarPage.keywords.slice(0, 2);
      internalLinks.push({
        anchor: anchorOptions[0] || pillarPage.title,
        targetTitle: pillarPage.title,
        targetSlug: pillarPage.slug,
      });
    }

    // Link to a couple of sibling pages
    const otherSiblings = pages.filter(p => p.id !== page.id && p.type !== 'pillar').slice(0, 3);
    for (const sibling of otherSiblings) {
      internalLinks.push({
        anchor: sibling.keywords[0] || sibling.title,
        targetTitle: sibling.title,
        targetSlug: sibling.slug,
      });
    }

    const siloContext: SiloContext = {
      siloName,
      pillarPage: pillarPage ? { title: pillarPage.title, slug: pillarPage.slug, keywords: pillarPage.keywords } : null,
      siblingPages: siblingPagesAll,
      internalLinks,
      brandVoice,
      niche,
    };

    const article = await generateSiloAwareArticle(
      page.title,
      page.type,
      page.keywords,
      siloContext,
      wordCountTarget,
      req
    );

    if (article) {
      results.push({ ...article, pageId: page.id });
    }

    if (onProgress) {
      onProgress(i + 1, pages.length);
    }
  }

  return results;
}

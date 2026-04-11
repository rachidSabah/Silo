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

// Map deprecated/legacy Gemini model names to current stable ones
// IMPORTANT: All mapped values must be REAL, STABLE models that exist in the Gemini API.
// Never map to preview or hallucinated model names.
const GEMINI_MODEL_MAP: Record<string, string> = {
  // Legacy alias
  'gemini-pro': 'gemini-2.0-flash',
  // Short aliases — map to stable models only
  'gemini-1.5-flash-8b': 'gemini-1.5-flash',
  'gemini-2.0-flash-lite': 'gemini-2.0-flash',
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
      max_tokens: 8192,
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
// Strategy: try progressively more aggressive extraction methods
function cleanAIResponse(text: string): string {
  if (!text || typeof text !== 'string') return '{}';

  // Step 1: strip markdown code fences and trim
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Step 2: try direct parse (most common case: AI returns clean JSON)
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // Step 3: scan for all balanced JSON objects/arrays and try each one
  // This handles AI text like: "Here are the pages: {...} Let me know if you need changes!"
  const jsonCandidates = findJSONCandidates(cleaned);
  for (const candidate of jsonCandidates) {
    try { JSON.parse(candidate); return candidate; } catch {}
  }

  // Step 4: aggressive cleanup - strip everything before first { or [ and after last } or ]
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');

  if (firstObj !== -1 || firstArr !== -1) {
    const startIdx = firstObj !== -1 && firstArr !== -1
      ? Math.min(firstObj, firstArr)
      : firstObj !== -1 ? firstObj : firstArr;

    const lastObj = cleaned.lastIndexOf('}');
    const lastArr = cleaned.lastIndexOf(']');

    if (startIdx !== -1) {
      const endIdx = Math.max(
        lastObj > startIdx ? lastObj : -1,
        lastArr > startIdx ? lastArr : -1
      );

      if (endIdx > startIdx) {
        const candidate = cleaned.slice(startIdx, endIdx + 1);
        try { JSON.parse(candidate); return candidate; } catch {}
      }
    }
  }

  // Step 5: return as-is (will fail in JSON.parse upstream, which is handled)
  return cleaned;
}

// Find all potential JSON object/array boundaries in the text
// Returns candidates ordered by size (largest first, as they're more likely to be complete)
function findJSONCandidates(text: string): string[] {
  const candidates: string[] = [];
  const MAX_CANDIDATES = 20; // Don't scan forever on very long text

  // Find all positions of { and [
  for (let startPos = 0; startPos < text.length && candidates.length < MAX_CANDIDATES; startPos++) {
    const ch = text[startPos];
    if (ch !== '{' && ch !== '[') continue;

    const isOpen = (c: string) => c === '{' || c === '[';
    const isClose = (c: string) => c === '}' || c === ']';
    const matches = (o: string, c: string) => (o === '{' && c === '}') || (o === '[' && c === ']');

    // Track balanced brackets from this start position
    const stack: string[] = [ch];
    let inString = false;
    let escape = false;

    for (let i = startPos + 1; i < text.length && stack.length > 0; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (isOpen(c)) {
        stack.push(c);
      } else if (isClose(c) && stack.length > 0 && matches(stack[stack.length - 1], c)) {
        stack.pop();
        if (stack.length === 0) {
          candidates.push(text.slice(startPos, i + 1));
          break;
        }
      }
    }
  }

  // Sort by length descending (larger candidates more likely to be complete)
  candidates.sort((a, b) => b.length - a.length);

  return candidates;
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

    // If the AI returned a flat array of page objects, group by silo_name/siloName/silo field
    if (Array.isArray(parsed)) {
      return groupArrayBySilo(parsed as Record<string, unknown>[], silos);
    }

    const obj = parsed as Record<string, unknown>;

    // Check common wrapper keys first
    for (const key of ['pagesBySilo', 'pages', 'silos', 'data', 'result']) {
      if (obj[key] && typeof obj[key] === 'object') {
        if (Array.isArray(obj[key])) {
          // Wrapper key contains an array of pages — group by silo_name field
          const grouped = groupArrayBySilo(obj[key] as Record<string, unknown>[], silos);
          if (Object.keys(grouped).length > 0) return grouped;
        } else {
          // Wrapper key contains an object — flatten it
          const inner = obj[key] as Record<string, unknown>;
          const flattened = flattenSiloEntries(inner, silos, true);
          if (Object.keys(flattened).length > 0) return flattened;
        }
      }
    }

    // Check if parsed itself is {siloName: [...]} directly
    const siloNames = new Set(silos.map(s => s.name));
    const entries = Object.entries(obj);
    const matchingEntries = entries.filter(([key, val]) =>
      siloNames.has(key) ||
      (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'title' in (val[0] as Record<string, unknown>)) ||
      (typeof val === 'object' && val !== null && !Array.isArray(val))
    );
    if (matchingEntries.length > 0) {
      // Don't skip any keys when processing matching entries — they were already filtered
      const flattened = flattenSiloEntries(Object.fromEntries(matchingEntries), silos, false);
      if (Object.keys(flattened).length > 0) return flattened;
    }

    // Last resort: find any property whose value is an object with array values
    for (const [key, val] of entries) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const inner = val as Record<string, unknown>;
        const hasValidContent = Object.values(inner).some(v => Array.isArray(v) || (typeof v === 'object' && v !== null && !Array.isArray(v)));
        if (hasValidContent) {
          const flattened = flattenSiloEntries(inner, silos, true);
          if (Object.keys(flattened).length > 0) return flattened;
        }
      }
    }

    // Ultra-last resort: scan ALL keys recursively for any array containing objects with 'title'
    const deepPages = deepExtractPages(obj, silos);
    if (Object.keys(deepPages).length > 0) return deepPages;

    console.error('[extractPagesBySilo] No valid page data found in parsed object. Keys:', Object.keys(obj));
    return {};
  } catch (e) {
    console.error('[extractPagesBySilo] Unexpected error:', e instanceof Error ? e.message : e);
    return {};
  }
}

// Group a flat array of page objects by their silo_name/siloName/silo field
function groupArrayBySilo(
  pages: Record<string, unknown>[],
  silos: { name: string; keywords: string[] }[]
): Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> {
  const result: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
  const siloNames = new Set(silos.map(s => s.name));

  for (const page of pages) {
    if (!page || typeof page !== 'object' || !page.title) continue;
    const siloKey = (page.silo_name || page.siloName || page.silo || silos[0]?.name || 'Default') as string;
    // Try to fuzzy-match the silo key to an actual silo name
    let matchedSilo = siloKey;
    if (!siloNames.has(siloKey)) {
      const lower = siloKey.toLowerCase();
      for (const name of siloNames) {
        if (name.toLowerCase() === lower || name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) {
          matchedSilo = name;
          break;
        }
      }
    }
    if (!result[matchedSilo]) result[matchedSilo] = [];
    result[matchedSilo].push({
      title: (page.title as string) || '',
      slug: (page.slug as string) || ((page.title as string) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      meta_description: (page.meta_description as string) || (page.metaDescription as string) || (page.description as string) || '',
      keywords: Array.isArray(page.keywords) ? page.keywords as string[] : [],
      type: inferPageType(siloKey, page.type as string),
    });
  }

  return result;
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
// skipWrapperKeys: when true, skip keys like 'pages', 'silos' etc. that are wrapper keys, not silo names
function flattenSiloEntries(
  obj: Record<string, unknown>,
  silos: { name: string; keywords: string[] }[],
  skipWrapperKeys: boolean = false
): Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> {
  const result: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
  const siloNames = new Set(silos.map(s => s.name));

  for (const [siloKey, siloVal] of Object.entries(obj)) {
    // Skip known wrapper keys only when called from wrapper-key extraction context
    if (skipWrapperKeys && ['pagesBySilo', 'pages', 'silos', 'data', 'result', 'error', 'ok'].includes(siloKey)) continue;

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
  const safeNiche = niche || 'seo';
  const safeLanguage = language || 'en';
  const content = await callAI([
    { role: 'system', content: `You are a Principal SEO Architect specializing in keyword research for the "${safeNiche}" niche. Given seed keywords, expand them into a comprehensive list of keywords and long-tail variations that are DIRECTLY relevant to "${safeNiche}".

RULES:
1. Every keyword must be a term that someone interested in "${safeNiche}" would actually search for.
2. Include a mix of: informational keywords (how to, what is, guide), commercial keywords (best, top, review, comparison), and transactional keywords (buy, price, cheap, discount).
3. Include long-tail variations that combine the niche name with specific aspects (e.g., "${safeNiche} for beginners", "${safeNiche} tools", "best ${safeNiche} strategies").
4. Do NOT include generic keywords that could apply to any niche — every keyword must be specifically about "${safeNiche}".
5. Include the niche name itself and common abbreviations/synonyms.

Return ONLY a JSON array of keyword strings. No other text. No markdown fences. Language: ${safeLanguage}.` },
    { role: 'user', content: `Expand these seed keywords for the niche "${safeNiche}": ${safeKeywords.join(', ')}

Generate 30-50 keywords that are ALL directly relevant to "${safeNiche}". Include the niche name in many of the long-tail variations. Return as a JSON array.` },
  ], req);
  return extractArray<string>(content, 'keywords', safeKeywords);
}

export async function generateSilos(niche: string, keywords: string[], language: string, req?: NextRequest): Promise<{ name: string; keywords: string[] }[]> {
  const safeKeywords = Array.isArray(keywords) ? keywords : [niche || 'seo'].filter(Boolean);
  const safeNiche = niche || 'seo';
  const safeLanguage = language || 'en';
  const content = await callAI([
    { role: 'system', content: `You are a Principal SEO Architect specializing in building tightly-themed content silo structures for websites. Your silos must be DIRECTLY relevant to the target niche and keywords.

RULES:
1. Every silo must be a distinct sub-topic WITHIN the niche — not a generic category that could apply to any industry.
2. Silo keywords must be specific, search-intent-driven terms that real users would search for in this niche.
3. Each silo should target a different facet of the niche to avoid keyword overlap/cannibalization between silos.
4. Include a mix of commercial and informational keywords in each silo.
5. Silo names should be descriptive 2-4 word phrases that clearly indicate the sub-topic.

Return ONLY a JSON array of objects. Each object must have:
- "name": the silo category name (2-4 words, specific to the niche)
- "keywords": array of 5-8 relevant keywords for that silo (must include the niche name or a close variant in at least 2 keywords)

No other text. No markdown fences. Language: ${safeLanguage}.` },
    { role: 'user', content: `Create 4-8 content silo categories for the niche "${safeNiche}".

Seed keywords to cover: ${safeKeywords.join(', ')}

IMPORTANT: Each silo must be a DIRECTLY relevant sub-topic of "${safeNiche}". Every keyword in every silo must make sense for someone searching about "${safeNiche}". Do NOT generate generic categories — they must be specific to this exact niche.

Return as a JSON array.` },
  ], req);
  return extractArray<{ name: string; keywords: string[] }>(content, 'silos', [{ name: safeNiche, keywords: safeKeywords }]);
}

export interface GeneratePagesResult {
  pagesBySilo: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string; target_keyword?: string; search_intent?: string; suggested_parent_keyword?: string }[]>;
  _debug?: {
    rawLength: number;
    rawPreview: string;
    parseError?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE MASTER PROMPT — Forces the AI to act as a Master SEO
// Strategist that outputs a strict, highly relevant, hierarchical JSON
// structure for silo page generation.
// ═══════════════════════════════════════════════════════════════════════════
const ARCHITECTURE_MASTER_PROMPT = `You are a Master Technical SEO Architect. Your job is to build a highly relevant, deeply semantic topical map for a specific SEO Silo. You must generate the pages that belong in this silo and output them in strict JSON format.

### STRICT SILO HIERARCHY RULES
You must generate three tiers of pages. They must be perfectly aligned with the target niche and completely avoid irrelevant fluff.

1. **The Pillar Page (Tier 1):** The overarching, broad topic of the silo. There is only ONE pillar page per silo. This is the definitive, comprehensive guide that everything else links back to. Example: If the silo is about "Dog Training", the pillar is "Complete Guide to Dog Training".
2. **Cluster Pages (Tier 2):** Deep-dive subcategories that strictly fall under the Pillar. These must be highly relevant commercial or informational hubs. Each cluster covers a distinct subtopic that does NOT overlap with other clusters. Example: "Puppy Potty Training", "Leash Training for Dogs", "Dog Obedience Training".
3. **Blog Pages (Tier 3):** Long-tail, highly specific informational queries that support a specific Cluster. These answer real search questions people type into Google. Example: "How often should a 2-month-old puppy pee?", "Best leash for a pulling Labrador".

### RELEVANCE STRICTNESS
- DO NOT generate generic pages like "Introduction to [Topic]" or "History of [Topic]" unless there is massive search volume for it.
- Every Cluster must logically fit inside the Pillar. If it doesn't, it belongs in a different silo.
- Every Blog must logically fit inside a Cluster. If it doesn't, it belongs under a different cluster.
- Ensure high semantic relevance. Use exact-match and LSI keywords for the target search intent.
- NO filler pages. Every page must serve a clear search intent and have ranking potential.
- Each page must target a DISTINCT primary keyword. No two pages may compete for the same keyword (anti-cannibalization).

### SEARCH INTENT MAPPING
- Pillar pages: "Informational" (broad guide) or "Commercial" (buyer's guide)
- Cluster pages: "Commercial" (product/service subcategory) or "Informational" (deep tutorial)
- Blog pages: "Informational" (how-to, FAQ, comparison) or "Transactional" (deal, price, discount)

### PARENT-CHILD LINKING
- Every Cluster page's "suggested_parent_keyword" MUST be the Pillar's "target_keyword".
- Every Blog page's "suggested_parent_keyword" MUST be one of the Cluster pages' "target_keyword".
- This creates a strict hierarchy: Blogs → Clusters → Pillar.

### OUTPUT FORMAT
You MUST return your response as a raw JSON array of objects, with NO markdown formatting, NO markdown code blocks, and NO conversational text. Use this exact schema:

[
  {
    "title": "Optimized Page Title (50-60 chars)",
    "slug": "url-friendly-slug-lowercase-hyphens",
    "meta_description": "Compelling 150-160 char description with primary keyword",
    "keywords": ["primary keyword", "LSI keyword 1", "LSI keyword 2", "LSI keyword 3"],
    "target_keyword": "Primary Target Keyword",
    "type": "pillar" | "cluster" | "blog",
    "search_intent": "Informational" | "Commercial" | "Transactional",
    "suggested_parent_keyword": "The target_keyword of the page this should link up to",
    "silo_name": "EXACT name of the silo this page belongs to"
  }
]

CRITICAL: Return ONLY the JSON array. No wrapper object. No explanations. No markdown.`;

export async function generatePages(
  silos: { name: string; keywords: string[] }[],
  niche: string,
  language: string,
  req?: NextRequest,
  seedKeywords?: string[]
): Promise<GeneratePagesResult> {
  // Safe fallbacks for optional data
  const safeNiche = niche || 'the target industry';
  const safeLanguage = language || 'en';
  const safeSeedKeywords = Array.isArray(seedKeywords) && seedKeywords.length > 0 ? seedKeywords : [];
  const safeSilos = Array.isArray(silos) && silos.length > 0 ? silos : [{ name: safeNiche, keywords: [safeNiche] }];

  // Build the silo details section for the user payload
  const siloDetails = safeSilos.map(s =>
    `Silo: "${s.name}"\n  Seed Keywords: ${s.keywords.join(', ')}`
  ).join('\n\n');

  // Build the structured user payload with strict JSON schema enforcement
  const userPayload = `Generate the page architecture for the following Silo(s) in the "${safeNiche}" niche:

${siloDetails}

${safeSeedKeywords.length > 0 ? `Core niche keywords to weave throughout all pages: ${safeSeedKeywords.join(', ')}\n` : ''}For EACH silo, generate:
- Exactly 1 Pillar Page (type: "pillar")
- 3 to 5 Cluster Pages (type: "cluster") — each strictly under the Pillar
- 2 to 3 Blog Pages per Cluster (type: "blog") — each supporting a specific Cluster

Every page must be DIRECTLY relevant to "${safeNiche}". Use the silo's seed keywords as the foundation for each page's keyword strategy.

You MUST return your response as a raw JSON array of objects, with NO markdown formatting, NO markdown code blocks (\`\`\`json), and NO conversational text. Use this exact schema:

[
  {
    "title": "Optimized Page Title (50-60 chars)",
    "slug": "url-friendly-slug-lowercase-hyphens",
    "meta_description": "Compelling 150-160 char description with primary keyword",
    "keywords": ["primary keyword", "LSI keyword 1", "LSI keyword 2", "LSI keyword 3"],
    "target_keyword": "Primary Target Keyword",
    "type": "pillar" | "cluster" | "blog",
    "search_intent": "Informational" | "Commercial" | "Transactional",
    "suggested_parent_keyword": "The target_keyword of the page this should link up to (e.g. a blog links to a cluster)",
    "silo_name": "EXACT name of the silo this page belongs to"
  }
]

REMEMBER:
- Each Cluster's suggested_parent_keyword = the Pillar's target_keyword
- Each Blog's suggested_parent_keyword = one Cluster's target_keyword
- Language: ${safeLanguage}
- Return ONLY the raw JSON array. No wrapper object. No markdown. No explanations.`;

  const content = await callAI([
    { role: 'system', content: ARCHITECTURE_MASTER_PROMPT },
    { role: 'user', content: userPayload },
  ], req);

  console.log('[generatePages] AI raw response length:', content.length, 'first 500 chars:', content.slice(0, 500));

  // ─────────────────────────────────────────────────────────────────
  // STEP 1: Strip markdown formatting and extract clean JSON
  // ─────────────────────────────────────────────────────────────────
  const rawPages = parseAIPageArray(content);

  if (rawPages.length === 0) {
    console.log('[generatePages] parseAIPageArray returned empty, trying legacy extractPagesBySilo...');
    // Fallback: try the legacy multi-layer extraction for backward compatibility
    const legacyResult = extractPagesBySilo(content, safeSilos);
    if (Object.keys(legacyResult).length > 0) {
      console.log('[generatePages] Legacy extraction succeeded, keys:', Object.keys(legacyResult));
      return { pagesBySilo: legacyResult };
    }
    // All extraction failed — return debug info
    return {
      pagesBySilo: {},
      _debug: {
        rawLength: content.length,
        rawPreview: content.slice(0, 5000),
        parseError: 'All JSON extraction methods failed. AI response could not be parsed as page data.',
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 2: Validate and normalize each page object
  // ─────────────────────────────────────────────────────────────────
  const validatedPages = rawPages.map((page: Record<string, unknown>) => ({
    title: String(page.title || '').trim(),
    slug: String(page.slug || String(page.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim(),
    meta_description: String(page.meta_description || page.metaDescription || page.description || '').trim(),
    keywords: Array.isArray(page.keywords) ? (page.keywords as string[]).map(String) : [],
    target_keyword: String(page.target_keyword || page.targetKeyword || '').trim(),
    type: validatePageType(page.type as string),
    search_intent: validateSearchIntent(String(page.search_intent || page.searchIntent || '')),
    suggested_parent_keyword: String(page.suggested_parent_keyword || page.suggestedParentKeyword || page.parent_keyword || '').trim(),
    silo_name: String(page.silo_name || page.siloName || page.silo || safeSilos[0]?.name || '').trim(),
  })).filter((p: { title: string }) => p.title.length > 0);

  // ─────────────────────────────────────────────────────────────────
  // STEP 3: Group pages by silo name with fuzzy matching
  // ─────────────────────────────────────────────────────────────────
  const pagesBySilo: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string; target_keyword?: string; search_intent?: string; suggested_parent_keyword?: string }[]> = {};
  const siloNames = new Set(safeSilos.map(s => s.name));

  for (const page of validatedPages) {
    // Fuzzy-match silo name
    let matchedSilo = page.silo_name;
    if (!siloNames.has(matchedSilo)) {
      const lower = matchedSilo.toLowerCase();
      for (const name of siloNames) {
        if (name.toLowerCase() === lower || name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) {
          matchedSilo = name;
          break;
        }
      }
    }
    // If still no match, assign to the first silo
    if (!siloNames.has(matchedSilo) && safeSilos.length > 0) {
      matchedSilo = safeSilos[0].name;
    }
    if (!pagesBySilo[matchedSilo]) pagesBySilo[matchedSilo] = [];
    pagesBySilo[matchedSilo].push({
      title: page.title,
      slug: page.slug,
      meta_description: page.meta_description,
      keywords: page.keywords,
      type: page.type,
      target_keyword: page.target_keyword || undefined,
      search_intent: page.search_intent || undefined,
      suggested_parent_keyword: page.suggested_parent_keyword || undefined,
    });
  }

  console.log('[generatePages] Successfully extracted pages. Silo keys:', Object.keys(pagesBySilo),
    'total pages:', Object.values(pagesBySilo).reduce((sum, arr) => sum + arr.length, 0));

  // Log hierarchy validation
  for (const [siloName, siloPages] of Object.entries(pagesBySilo)) {
    const pillarCount = siloPages.filter(p => p.type === 'pillar').length;
    const clusterCount = siloPages.filter(p => p.type === 'cluster').length;
    const blogCount = siloPages.filter(p => p.type === 'blog').length;
    console.log(`[generatePages] Silo "${siloName}": ${pillarCount} pillar, ${clusterCount} cluster, ${blogCount} blog`);
  }

  return { pagesBySilo };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROBUST JSON PARSER — Strips markdown formatting, extracts the page array
// from any AI response format (raw array, wrapped in object, etc.)
// ═══════════════════════════════════════════════════════════════════════════
function parseAIPageArray(rawText: string): Record<string, unknown>[] {
  if (!rawText || typeof rawText !== 'string') return [];

  // Step 1: Strip markdown code fences
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`{1,2}json\s*/gi, '')
    .trim();

  // Step 2: Try direct JSON.parse
  try {
    const parsed = JSON.parse(cleaned);
    return extractPageArrayFromParsed(parsed);
  } catch {}

  // Step 3: Find balanced JSON boundaries (object or array)
  const candidates = findJSONCandidates(cleaned);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const pages = extractPageArrayFromParsed(parsed);
      if (pages.length > 0) return pages;
    } catch {}
  }

  // Step 4: Aggressive — strip everything before first [ or { and after last ] or }
  const firstArr = cleaned.indexOf('[');
  const firstObj = cleaned.indexOf('{');
  if (firstArr !== -1 || firstObj !== -1) {
    const startIdx = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj;
    const lastArr = cleaned.lastIndexOf(']');
    const lastObj = cleaned.lastIndexOf('}');
    const endIdx = Math.max(lastArr, lastObj);
    if (endIdx > startIdx) {
      const candidate = cleaned.slice(startIdx, endIdx + 1);
      try {
        const parsed = JSON.parse(candidate);
        return extractPageArrayFromParsed(parsed);
      } catch {}
    }
  }

  return [];
}

// Given a parsed JSON value, extract an array of page-like objects from it
function extractPageArrayFromParsed(parsed: unknown): Record<string, unknown>[] {
  // Direct array
  if (Array.isArray(parsed)) {
    const pages = parsed.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object' && 'title' in (item as Record<string, unknown>)
    );
    if (pages.length > 0) return pages;
    return [];
  }

  // Object — look for common wrapper keys
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;

    // Check common wrapper keys that might contain an array of pages
    for (const key of ['pages', 'data', 'result', 'articles', 'pageArchitecture']) {
      if (Array.isArray(obj[key])) {
        const pages = (obj[key] as unknown[]).filter(
          (item): item is Record<string, unknown> =>
            item !== null && typeof item === 'object' && 'title' in (item as Record<string, unknown>)
        );
        if (pages.length > 0) return pages;
      }
    }

    // Check if the object is keyed by silo names — flatten all arrays
    const allPages: Record<string, unknown>[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        const pages = val.filter(
          (item): item is Record<string, unknown> =>
            item !== null && typeof item === 'object' && 'title' in (item as Record<string, unknown>)
        );
        for (const page of pages) {
          if (!page.silo_name && !page.siloName && !page.silo) {
            page.silo_name = key;
          }
          allPages.push(page);
        }
      }
      // Handle nested {pillar: {}, clusters: [], blogs: []} structures
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const nested = val as Record<string, unknown>;
        for (const [subKey, subVal] of Object.entries(nested)) {
          if (subVal && typeof subVal === 'object' && !Array.isArray(subVal) && 'title' in (subVal as Record<string, unknown>)) {
            const page = subVal as Record<string, unknown>;
            if (!page.type) page.type = inferPageType(subKey, undefined);
            if (!page.silo_name) page.silo_name = key;
            allPages.push(page);
          }
          if (Array.isArray(subVal)) {
            for (const item of subVal) {
              if (item && typeof item === 'object' && 'title' in (item as Record<string, unknown>)) {
                const page = item as Record<string, unknown>;
                if (!page.type) page.type = inferPageType(subKey, undefined);
                if (!page.silo_name) page.silo_name = key;
                allPages.push(page);
              }
            }
          }
        }
      }
    }
    if (allPages.length > 0) return allPages;
  }

  return [];
}

// Validate page type against allowed values
function validatePageType(type: string): string {
  if (!type) return 'blog';
  const lower = String(type).toLowerCase().trim();
  if (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(lower)) return lower;
  if (lower.includes('pillar')) return 'pillar';
  if (lower.includes('cluster')) return 'cluster';
  if (lower.includes('blog') || lower.includes('post')) return 'blog';
  if (lower.includes('categor')) return 'category';
  if (lower.includes('land')) return 'landing';
  return 'blog';
}

// Validate search intent against allowed values
function validateSearchIntent(intent: string): string {
  if (!intent) return 'Informational';
  const lower = String(intent).toLowerCase().trim();
  if (lower.includes('commercial')) return 'Commercial';
  if (lower.includes('transaction')) return 'Transactional';
  if (lower.includes('navigational')) return 'Navigational';
  return 'Informational';
}


export async function suggestInternalLinks(
  pages: { id: string; title: string; slug: string; type: string; silo_id?: string | null }[],
  silos: { id: string; name: string }[],
  req?: NextRequest
): Promise<{ from: string; to: string; anchor: string }[]> {
  const safePages = Array.isArray(pages) ? pages : [];
  const safeSilos = Array.isArray(silos) ? silos : [];
  if (safePages.length === 0) return [];
  const content = await callAI([
    { role: 'system', content: `You are a Principal SEO Architect specializing in internal linking strategy. Given a list of pages and their silos, suggest internal links between pages. Prioritize:
1. Links from pillar pages to cluster/blog pages in the same silo
2. Links between related cluster pages in the same silo
3. Cross-silo links where topics overlap (only when contextually natural)

Rules:
- Each link must have a specific, keyword-rich anchor text (3-6 words)
- Anchor text must describe the target page's content, not be generic like "click here"
- Avoid linking to the same page multiple times
- Maximum 3 links from any single page

Return ONLY a JSON array of link objects with "from" (page id), "to" (page id), and "anchor" (link anchor text). No other text. No markdown fences.` },
    { role: 'user', content: `Suggest internal links for these pages:\n${JSON.stringify(safePages.slice(0, 50))}\nSilos: ${JSON.stringify(safeSilos)}` },
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
  // Safe fallbacks for optional data
  const safeKeywords = Array.isArray(keywords) && keywords.length > 0 ? keywords : [pageTitle];
  const safeNiche = niche || 'the target industry';
  const safeSiloName = siloName || 'General';
  const safePageType = pageType || 'blog';
  const safeSiblingPages = Array.isArray(siblingPages) ? siblingPages : [];

  const userPayload = `Generate a comprehensive content brief for:

- Target Keyword: ${safeKeywords[0]}
- Secondary Keywords: ${safeKeywords.slice(1).join(', ') || 'N/A'}
- Page Type: ${safePageType}
- Silo: ${safeSiloName}
- Niche: ${safeNiche}
- Search Intent: ${safePageType === 'pillar' ? 'Informational + Commercial' : safePageType === 'cluster' ? 'Informational' : 'Mixed'}
- Brand Voice: Professional and authoritative
- Sibling pages in silo (AVOID deep coverage of these topics): ${safeSiblingPages.length > 0
    ? safeSiblingPages.map(p => `"${p.title}" (${p.type})`).join(', ')
    : 'None (standalone page)'}

Page-type specific requirements:
${safePageType === 'pillar'
    ? 'This is a PILLAR page — create a brief for a comprehensive, encyclopedic guide covering the topic breadth-first. Target 2500-3500 words. Include 6-10 H2 sections.'
    : safePageType === 'cluster'
    ? 'This is a CLUSTER page — create a brief for a focused deep-dive into one specific subtopic. Target 1500-2500 words. Must link UP to the pillar page. Include 4-6 H2 sections.'
    : safePageType === 'blog'
    ? 'This is a BLOG post — create a brief for an engaging, timely article targeting a long-tail query. Target 1000-1500 words. Conversational yet authoritative tone.'
    : 'Create a brief appropriate for this page type within the silo structure.'}

Return ONLY a JSON object with these fields:
- "title": optimized H1 heading
- "targetKeywords": array of 3-5 primary keywords
- "searchIntent": one of informational/transactional/commercial/navigational
- "contentType": guide/tutorial/listicle/comparison/etc
- "wordCountTarget": e.g., "2000-2500"
- "outline": array of H2 section headings
- "keyPoints": array of must-cover points with specific data/expertise requirements
- "internalLinkTargets": array of suggested pages to link to
- "metaDescription": 150-160 chars including primary keyword
- "callToAction": suggested CTA aligned with search intent`;

  const content = await callAI([
    { role: 'system', content: SEO_MASTER_PROMPT },
    { role: 'user', content: userPayload },
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

/**
 * SEO_MASTER_PROMPT — The master system instruction governing the AI's behavior
 * across ALL article generation. This ensures every article is written as if by
 * an ultra-expert SEO architect who strictly adheres to silo architecture rules,
 * HCU compliance, E-E-A-T principles, and semantic density requirements.
 */
export const SEO_MASTER_PROMPT = `You are a Principal SEO Architect, Semantic Entity Expert, and Top-Tier Direct-Response Copywriter. Your objective is to write the highest-ranking, most authoritative, and perfectly optimized article on the internet for the provided target keyword.

### CORE SEO & CONTENT PHILOSOPHY (HCU COMPLIANT)
1. Information Gain: Do not rehash the top 10 Google results. Introduce unique angles, proprietary data, expert interviews, and deep-dive insights that no competitor offers.
2. E-E-A-T: Write with the commanding tone of an industry veteran with 15+ years of experience. Avoid robotic transitions like "In conclusion", "In today's digital age", "It goes without saying", or "As we all know". Write as if you are the definitive authority on this topic.
3. Semantic Density: Naturally weave in semantic entities (named people, tools, frameworks, companies, standards), LSI keywords, and co-occurring terms that Google's NLP models expect to see in authoritative content on this topic.
4. Search Intent: Immediately satisfy the user's search intent in the first 100 words. Do not bury the answer. Open with a direct, authoritative answer or value proposition that makes the reader stay.
5. Content Depth: Every claim must be substantiated. Use statistics, case studies, expert quotes, or real-world examples. Generic advice like "be consistent" or "do your research" is FORBIDDEN — provide specific, actionable directives.

### STRICT SILO & INTERNAL LINKING RULES
1. No Cannibalization: Review the [Sibling Topics] provided below. You are strictly FORBIDDEN from writing deeply about these topics. Mention them only in passing with a contextual internal link. Your article must own its specific angle without encroaching on sibling territory.
2. Pillar Page Support: If this is NOT the pillar page, you MUST include a contextual internal link to the [Pillar Page] within the first 30% of the article using the exact [Target Anchor Text] provided. This is non-negotiable.
3. Formatting: Format all internal links in valid HTML: <a href="/target-slug">Exact Anchor Text Provided</a>. Use the exact slug and anchor text given — do not invent your own.
4. No Bleeding: Do NOT link to any concepts outside of the provided Silo Context. Every internal link must point to a page within this silo. No external-site links in the body (except authoritative source citations).
5. Link Distribution: Include 2-5 internal links per article. At least one must point to the pillar page (if this is not the pillar). Distribute remaining links to sibling cluster/blog pages where contextually natural.

### FORMATTING RULES
1. Use strict, well-structured HTML: <h2> for main concepts, <h3> for sub-points, <p> for paragraphs, <ul>/<ol> for lists, <strong> for emphasis, <table> for data comparisons.
2. Every <h2> must be a keyword-optimized heading that serves as a standalone answer to a search query.
3. Use bullet points and tables for scannability. Google loves listicles and comparison tables for featured snippets.
4. Include a compelling, benefit-driven introduction that hooks the reader in the first sentence.
5. End with a clear, specific Call-To-Action (CTA) that drives the next step in the user journey.
6. Output ONLY the raw JSON object. No conversational filler, no markdown fences, no explanations.`;

export interface SiloContext {
  siloName: string;
  pillarPage: { title: string; slug: string; keywords: string[] } | null;
  siblingPages: Array<{ title: string; slug: string; type: string; keywords: string[] }>;
  internalLinks: Array<{ anchor: string; targetTitle: string; targetSlug: string }>;
  brandVoice?: string;
  niche: string;
  /** Search intent for the target keyword (informational, transactional, commercial, navigational) */
  searchIntent?: string;
  /** Suggested anchor text to use when linking back to the pillar page */
  suggestedAnchor?: string;
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
 *
 * This is the key differentiator: instead of just passing the target keyword,
 * we pass the ENTIRE silo context so the AI knows:
 * - What the pillar page covers (to link up to it)
 * - What sibling pages cover (to avoid duplication/cannibalization)
 * - Specific anchor texts to use for internal links
 * - Brand voice consistency requirements
 * - Search intent to satisfy immediately
 *
 * The messages array strictly separates the SEO_MASTER_PROMPT (system) from
 * the dynamic user payload, ensuring the system instruction governs behavior
 * regardless of which AI provider (OpenAI/Gemini/Claude/DeepSeek) is used.
 */
export async function generateSiloAwareArticle(
  pageTitle: string,
  pageType: string,
  pageKeywords: string[],
  siloContext: SiloContext,
  wordCountTarget: number,
  req?: NextRequest
): Promise<GeneratedArticleResult | null> {
  const {
    siloName,
    pillarPage,
    siblingPages,
    internalLinks,
    brandVoice,
    niche,
    searchIntent,
    suggestedAnchor,
  } = siloContext;

  // Safe defaults for optional fields — prevents prompt breakage
  const safeKeywords = Array.isArray(pageKeywords) && pageKeywords.length > 0
    ? pageKeywords
    : [pageTitle];
  const safeSearchIntent = searchIntent || 'Informational';
  const safeBrandVoice = brandVoice || 'Professional and authoritative';
  const safeNiche = niche || 'the target industry';

  // Page type → content strategy mapping
  const pageTypeInstructions: Record<string, string> = {
    pillar: `This is a PILLAR PAGE — the authoritative hub for the entire "${siloName}" silo. Write a comprehensive, encyclopedic guide (minimum ${wordCountTarget} words) that covers the topic breadth-first. It should be the definitive resource that all other pages in this silo link back to. Structure with 6-10 H2 sections covering every major facet.`,
    cluster: `This is a CLUSTER PAGE — a focused deep-dive into one specific subtopic of the pillar. Write an in-depth, expert-level analysis (minimum ${wordCountTarget} words) that goes deeper than any competitor. Link UP to the pillar page within the first 30% of the article using the exact anchor text provided.`,
    blog: `This is a BLOG POST — an engaging, timely article targeting a long-tail query. Write a compelling, action-oriented post (minimum ${wordCountTarget} words) that answers the search intent immediately. Use a slightly more conversational tone while maintaining authority. Link UP to the pillar page and relevant cluster pages.`,
    category: `This is a CATEGORY PAGE — a topical overview that groups related content. Write a structured overview (minimum ${wordCountTarget} words) with clear sections and links to all child pages. Prioritize navigation and discoverability.`,
    landing: `This is a LANDING PAGE — a conversion-focused page. Write persuasive, benefit-driven copy (minimum ${wordCountTarget} words) with clear CTAs, social proof, and urgency. Every section should drive toward the conversion goal.`,
  };

  // Build anti-cannibalization context from sibling pages
  const siblingEntries = siblingPages
    .filter(p => p.title !== pageTitle)
    .map(p => `  - "${p.title}" (${p.type}): covers ${p.keywords?.slice(0, 3).join(', ') || p.title}`)
    .join('\n');

  // Build strategic internal link instructions
  const linkInstructions = internalLinks
    .map(l => `  - Anchor: "${l.anchor}" → Target: "${l.targetTitle}" (/${l.targetSlug})`)
    .join('\n');

  // Build the topics-to-avoid list (anti-cannibalization)
  const avoidTopicsList = siblingPages
    .filter(p => p.title !== pageTitle)
    .map(p => p.keywords?.slice(0, 2).join(', ') || p.title)
    .filter(Boolean)
    .join('; ');

  // Determine the required pillar link anchor text
  const pillarAnchorText = suggestedAnchor
    || (pillarPage ? pillarPage.keywords?.[0] || pillarPage.title : null);
  const pillarSlug = pillarPage?.slug || '';

  // Construct the dynamic user payload — all variable data goes here
  const userPayload = `Execute the article based on these exact parameters:

- Target Keyword: ${safeKeywords[0]}
- Secondary Keywords: ${safeKeywords.slice(1).join(', ') || 'N/A'}
- Search Intent: ${safeSearchIntent}
- Page Type: ${pageType}
- Brand Voice: ${safeBrandVoice}
- Word Count Target: ${wordCountTarget} words
- Niche: ${safeNiche}

--- PAGE TYPE INSTRUCTION ---
${pageTypeInstructions[pageType] || pageTypeInstructions.blog}

--- SILO CONTEXT ---
- Silo Name: "${siloName}"
${pillarPage
    ? `- Parent Pillar Page: "${pillarPage.title}" (/${pillarSlug})
- REQUIRED INTERNAL LINK: You MUST link to the Parent Pillar Page using this exact anchor text: "${pillarAnchorText}"
  Format: <a href="/${pillarSlug}">${pillarAnchorText}</a>
  Placement: Within the first 30% of the article.`
    : '- This IS the Pillar Page. It should be the authoritative hub that all other silo pages link back to.'}

--- ANTI-CANNIBALIZATION RULES ---
Do NOT cover these topics deeply, as they are covered by sibling pages in this silo:
${siblingEntries || '- No sibling pages (standalone article)'}
Topics strictly off-limits for deep coverage: ${avoidTopicsList || 'None'}

--- INTERNAL LINKS TO INCLUDE ---
${linkInstructions || '- Include at least 2-3 contextual internal links to other pages in this silo where naturally relevant'}

--- CONTENT REQUIREMENTS ---
1. Immediately satisfy search intent in the first 100 words.
2. Every H2 heading must target a specific search query or sub-intent.
3. Include semantic entities, LSI terms, and co-occurring vocabulary naturally.
4. Substantiate claims with specific data, examples, or expert references.
5. End with a clear, specific Call-To-Action.
6. Return ONLY a JSON object: {"title": "...", "content": "...(HTML)...", "wordCount": N, "internalLinks": [{"anchor": "...", "targetSlug": "..."}], "metaDescription": "..."}`

  const content = await callAI([
    { role: 'system', content: SEO_MASTER_PROMPT },
    { role: 'user', content: userPayload },
  ], req);

  // Extract article from AI response, handling wrapped formats like {article: {...}}
  try {
    const cleaned = cleanAIResponse(content);
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
    // Try one more aggressive parse — sometimes the AI returns HTML with surrounding text
    try {
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = content.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(candidate);
        if (parsed.content && typeof parsed.content === 'string') {
          return parsed as GeneratedArticleResult;
        }
      }
    } catch {}
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

    // Determine suggested anchor text for pillar link
    const suggestedAnchor = (pillarPage && page.id !== pillarPage.id)
      ? (pillarPage.keywords?.[0] || pillarPage.title)
      : undefined;

    const siloContext: SiloContext = {
      siloName,
      pillarPage: pillarPage ? { title: pillarPage.title, slug: pillarPage.slug, keywords: pillarPage.keywords } : null,
      siblingPages: siblingPagesAll,
      internalLinks,
      brandVoice,
      niche,
      searchIntent: 'Informational',
      suggestedAnchor,
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

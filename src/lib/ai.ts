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
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch {
    return fallback;
  }
}

// Extract an array from AI response, handling both raw array and wrapped object formats
function extractArray<T>(text: string, arrayKey: string, fallback: T[]): T[] {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
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
function extractPagesBySilo(
  text: string,
  silos: { name: string; keywords: string[] }[]
): Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    // Check common wrapper keys first
    for (const key of ['pagesBySilo', 'pages', 'silos', 'data', 'result']) {
      if (parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
        const inner = parsed[key] as Record<string, unknown>;
        // Verify it looks like {siloName: [...]}
        const hasValidEntries = Object.values(inner).some(v => Array.isArray(v));
        if (hasValidEntries) return inner as Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]>;
      }
    }

    // Check if parsed itself is {siloName: [...]} directly
    const siloNames = new Set(silos.map(s => s.name));
    const entries = Object.entries(parsed);
    const matchingEntries = entries.filter(([key, val]) =>
      (siloNames.has(key) || (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'title' in (val[0] as Record<string, unknown>)))
    );
    if (matchingEntries.length > 0) {
      const result: Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]> = {};
      for (const [key, val] of matchingEntries) {
        if (Array.isArray(val)) {
          result[key] = val as { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[];
        }
      }
      if (Object.keys(result).length > 0) return result;
    }

    // Last resort: find any property whose value is an object with array values
    for (const [key, val] of entries) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const inner = val as Record<string, unknown>;
        const hasValidArrays = Object.values(inner).some(v => Array.isArray(v));
        if (hasValidArrays) return inner as Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]>;
      }
    }

    return {};
  } catch {
    return {};
  }
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
  return extractPagesBySilo(content, silos);
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

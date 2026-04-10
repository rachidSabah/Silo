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

async function callGemini(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

export async function expandKeywords(seedKeywords: string[], niche: string, language: string, req?: NextRequest): Promise<string[]> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO keyword research expert. Given seed keywords, expand them into a comprehensive list of related keywords and long-tail variations. Return ONLY a JSON array of strings, no other text. Language: ${language}.` },
    { role: 'user', content: `Expand these seed keywords for the niche "${niche}": ${seedKeywords.join(', ')}. Return 30-50 related keywords as a JSON array.` },
  ], req);
  return parseJSON(content, seedKeywords);
}

export async function generateSilos(niche: string, keywords: string[], language: string, req?: NextRequest): Promise<{ name: string; keywords: string[] }[]> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO architect specializing in website silo structure. Given a niche and keywords, suggest optimal content silo categories. Each silo should group related topics together. Return ONLY a JSON array of objects with "name" (silo name) and "keywords" (array of keywords for that silo). No other text. Language: ${language}.` },
    { role: 'user', content: `Generate 4-8 silo categories for the niche "${niche}" with these keywords: ${keywords.join(', ')}. Return as JSON array.` },
  ], req);
  return parseJSON(content, [{ name: niche, keywords }]);
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
  return parseJSON(content, {});
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
  return parseJSON(content, []);
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
  return parseJSON(content, [{ name: niche, keywords, intent: 'informational' }]);
}

export async function mapSearchIntent(
  keywords: string[],
  req?: NextRequest
): Promise<Array<{ keyword: string; intent: 'informational' | 'navigational' | 'transactional' | 'commercial'; funnelStage: string }>> {
  const content = await callAI([
    { role: 'system', content: `You are an SEO search intent expert. For each keyword, determine the primary search intent and funnel stage. Return ONLY a JSON array of objects with "keyword", "intent" (one of: informational, navigational, transactional, commercial), and "funnelStage" (one of: awareness, consideration, decision, retention). No other text.` },
    { role: 'user', content: `Map search intent for these keywords:\n${keywords.join('\n')}` },
  ], req);
  return parseJSON(content, keywords.map(k => ({ keyword: k, intent: 'informational' as const, funnelStage: 'awareness' })));
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
  return parseJSON(content, []);
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
  return parseJSON(content, null);
}

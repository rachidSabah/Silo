// AI abstraction supporting multiple providers: OpenAI, Google Gemini, Anthropic Claude, DeepSeek
// Falls back to z-ai-web-dev-sdk if no user setting is configured

import ZAI from 'z-ai-web-dev-sdk';
import { getActiveAISetting } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { AI_PROVIDERS } from '@/lib/ai-providers';

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
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
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
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
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
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callDeepSeek(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callZAI(messages: ChatMessage[]): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages,
    temperature: 0.7,
  });
  return completion.choices?.[0]?.message?.content || '';
}

// Main AI call function - resolves provider from user settings or falls back to z-ai
export async function callAI(messages: ChatMessage[], req?: NextRequest): Promise<string> {
  // Try to get user's active AI setting
  if (req) {
    try {
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
          }
        }
      }
    } catch {
      // Fall through to z-ai
    }
  }

  // Fallback to z-ai-web-dev-sdk (local dev only)
  return await callZAI(messages);
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

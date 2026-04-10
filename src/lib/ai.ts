import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export async function expandKeywords(seedKeywords: string[], niche: string, language: string): Promise<string[]> {
  const zai = await getAI();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are an SEO keyword research expert. Given seed keywords, expand them into a comprehensive list of related keywords and long-tail variations. Return ONLY a JSON array of strings, no other text. Language: ${language}.`
      },
      {
        role: 'user',
        content: `Expand these seed keywords for the niche "${niche}": ${seedKeywords.join(', ')}. Return 30-50 related keywords as a JSON array.`
      }
    ],
    temperature: 0.7,
  });

  try {
    const content = completion.choices[0]?.message?.content || '[]';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return seedKeywords;
  }
}

export async function generateSilos(niche: string, keywords: string[], language: string): Promise<{ name: string; keywords: string[] }[]> {
  const zai = await getAI();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are an SEO architect specializing in website silo structure. Given a niche and keywords, suggest optimal content silo categories. Each silo should group related topics together. Return ONLY a JSON array of objects with "name" (silo name) and "keywords" (array of keywords for that silo). No other text. Language: ${language}.`
      },
      {
        role: 'user',
        content: `Generate 4-8 silo categories for the niche "${niche}" with these keywords: ${keywords.join(', ')}. Return as JSON array.`
      }
    ],
    temperature: 0.7,
  });

  try {
    const content = completion.choices[0]?.message?.content || '[]';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return [{ name: niche, keywords }];
  }
}

export async function generatePages(
  silos: { name: string; keywords: string[] }[],
  niche: string,
  language: string
): Promise<Record<string, { title: string; slug: string; meta_description: string; keywords: string[]; type: string }[]>> {
  const zai = await getAI();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are an SEO content strategist. Given silo categories and their keywords, generate a comprehensive page structure for each silo. Each silo should have:
- 1 pillar page (comprehensive guide, type "pillar")
- 2-4 cluster pages (in-depth subtopics, type "cluster")
- 2-4 blog posts (type "blog")

Return ONLY a JSON object where keys are silo names and values are arrays of page objects. Each page object must have: "title", "slug" (URL-friendly, lowercase, hyphens), "meta_description" (150-160 chars), "keywords" (array of 3-5 keywords), "type" (pillar|cluster|blog). No other text. Language: ${language}.`
      },
      {
        role: 'user',
        content: `Generate pages for silos in niche "${niche}":\n${silos.map(s => `Silo: ${s.name} - Keywords: ${s.keywords.join(', ')}`).join('\n')}`
      }
    ],
    temperature: 0.7,
  });

  try {
    const content = completion.choices[0]?.message?.content || '{}';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

export async function suggestInternalLinks(
  pages: { id: string; title: string; slug: string; type: string; silo_id?: string | null }[],
  silos: { id: string; name: string }[]
): Promise<{ from: string; to: string; anchor: string }[]> {
  const zai = await getAI();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are an SEO internal linking expert. Given a list of pages and their silos, suggest internal links between pages. Prioritize:
1. Links from pillar pages to cluster/blog pages in the same silo
2. Links between related cluster pages
3. Cross-silo links where topics overlap

Return ONLY a JSON array of link objects with "from" (page id), "to" (page id), and "anchor" (link anchor text). No other text.`
      },
      {
        role: 'user',
        content: `Suggest internal links for these pages:\n${JSON.stringify(pages.slice(0, 50))}\nSilos: ${JSON.stringify(silos)}`
      }
    ],
    temperature: 0.5,
  });

  try {
    const content = completion.choices[0]?.message?.content || '[]';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

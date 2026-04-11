import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * POST /api/cms/push
 * Push a generated article to a CMS (WordPress or headless via webhook).
 *
 * Body: {
 *   cmsType: 'wordpress' | 'webhook' | 'headless',
 *   cmsUrl: string,
 *   cmsApiKey?: string,
 *   cmsUsername?: string,
 *   cmsPassword?: string,
 *   article: { title, content, slug, metaDescription, status },
 *   publish?: boolean
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cmsType, cmsUrl, cmsApiKey, cmsUsername, cmsPassword, article, publish } = body;

    if (!cmsType || !cmsUrl || !article) {
      return NextResponse.json(
        { error: 'cmsType, cmsUrl, and article are required' },
        { status: 400 }
      );
    }

    if (cmsType === 'wordpress') {
      return await pushToWordPress(cmsUrl, cmsUsername, cmsPassword, article, publish);
    }

    if (cmsType === 'webhook' || cmsType === 'headless') {
      return await pushViaWebhook(cmsUrl, cmsApiKey, article);
    }

    return NextResponse.json({ error: `Unsupported CMS type: ${cmsType}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'CMS push failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pushToWordPress(
  url: string,
  username?: string,
  password?: string,
  article?: { title: string; content: string; slug: string; metaDescription: string; status?: string },
  publish?: boolean
) {
  if (!username || !password) {
    return NextResponse.json(
      { error: 'WordPress username and application password are required' },
      { status: 400 }
    );
  }

  if (!article) {
    return NextResponse.json({ error: 'Article data is required' }, { status: 400 });
  }

  // WordPress REST API v2 endpoint
  const wpApiUrl = url.replace(/\/$/, '') + '/wp-json/wp/v2/posts';

  const auth = btoa(`${username}:${password}`);

  const wpPost = {
    title: article.title,
    content: article.content,
    slug: article.slug,
    status: publish ? 'publish' : 'draft',
    // WordPress uses 'excerpt' for meta description-like content
    excerpt: article.metaDescription || '',
  };

  const res = await fetch(wpApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(wpPost),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return NextResponse.json(
      { error: `WordPress API error (${res.status}): ${errBody.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({
    success: true,
    postId: data.id,
    postUrl: data.link,
    status: data.status,
  });
}

async function pushViaWebhook(
  url: string,
  apiKey?: string,
  article?: { title: string; content: string; slug: string; metaDescription: string }
) {
  if (!article) {
    return NextResponse.json({ error: 'Article data is required' }, { status: 400 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: article.title,
      content: article.content,
      slug: article.slug,
      metaDescription: article.metaDescription,
      source: 'siloforge',
      timestamp: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return NextResponse.json(
      { error: `Webhook error (${res.status}): ${errBody.slice(0, 300)}` },
      { status: 502 }
    );
  }

  let responseData;
  try {
    responseData = await res.json();
  } catch {
    responseData = { status: 'ok' };
  }

  return NextResponse.json({
    success: true,
    response: responseData,
  });
}

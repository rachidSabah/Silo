// Unified API Route Handler for Cloudflare Pages
// Consolidates all 33 API routes into a single function to reduce Worker bundle size
// from ~10.3 MiB (33 separate functions) to ~350 KiB (1 shared function)

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, hashPassword, verifyPassword, createToken } from '@/lib/auth';
import {
  getAllProjects, getProjectById, createProject, updateProject, deleteProject,
  getSilosByProject, createSilo, updateSilo, deleteSilo,
  getPagesByProject, createPage, updatePage, deletePage,
  getInternalLinksByProject, createInternalLink, deleteInternalLink,
  getAllUsers, getUserByEmail, getUserById, createUser, updateUser, deleteUser,
  getActiveAISetting, getAISettingsByUser, upsertAISetting, deleteAISetting, setActiveAISetting,
  getGSCMetricsBySilo, updatePageGSCMetrics,
} from '@/lib/db';
import { callAI, expandKeywords, generateSilos, generatePages, suggestInternalLinks, groupKeywords, mapSearchIntent, analyzeContentGap, generateContentBrief, generateSiloAwareArticle, humanizeContent, analyzeSERPFeatures } from '@/lib/ai';
import { scrapeCompetitorSite, buildScrapedPayloadForAI } from '@/lib/edge-scraper';
import { processInBatches, BATCH_SIZES, retryWithBackoff } from '@/lib/concurrency';

export const runtime = 'edge';

export async function GET(req: NextRequest) { return handleRequest(req); }
export async function POST(req: NextRequest) { return handleRequest(req); }
export async function PUT(req: NextRequest) { return handleRequest(req); }
export async function DELETE(req: NextRequest) { return handleRequest(req); }
export async function PATCH(req: NextRequest) { return handleRequest(req); }

function json(data: unknown) { return NextResponse.json(data); }
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
async function body(req: NextRequest) {
  try { return await req.json(); } catch { return {}; }
}

async function handleRequest(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const seg = path.split('/').filter(Boolean);
  const m = req.method;

  try {
    switch (true) {
      // Projects — both /api/ and /api/projects paths
      case (path === '' || path === 'projects') && m === 'GET': { const u = await getUserFromRequest(req); return json(await getAllProjects(u?.userId)); }
      case (path === '' || path === 'projects') && m === 'POST': { const u = await getUserFromRequest(req); const d = await body(req); await createProject({ id: d.id || crypto.randomUUID(), name: d.name || '', domain: d.domain || '', language: d.language || 'en', niche: d.niche || '', seed_keywords: d.seed_keywords || (d.seedKeywords ? JSON.stringify(d.seedKeywords) : ''), user_id: u?.userId || null }); return json({ ok: true }); }
      case seg.length === 1 && isUUID(seg[0]) && m === 'GET': return json(await getProjectById(seg[0]));
      case seg.length === 1 && isUUID(seg[0]) && m === 'DELETE': await deleteProject(seg[0]); return json({ ok: true });
      // Projects/:id & gsc-metrics
      case seg[0] === 'projects' && seg.length === 2 && isUUID(seg[1]) && m === 'GET': return json(await getProjectById(seg[1]));
      case seg[0] === 'projects' && seg.length === 2 && isUUID(seg[1]) && m === 'PUT': { const d = await body(req); await updateProject(seg[1], d); return json({ ok: true }); }
      case seg[0] === 'projects' && seg.length === 2 && isUUID(seg[1]) && m === 'PATCH': { const d = await body(req); await updateProject(seg[1], d); return json({ ok: true }); }
      case seg[0] === 'projects' && seg.length === 2 && isUUID(seg[1]) && m === 'DELETE': await deleteProject(seg[1]); return json({ ok: true });
      case seg[0] === 'projects' && seg.length === 3 && isUUID(seg[1]) && seg[2] === 'gsc-metrics' && m === 'GET': { const user = await getUserFromRequest(req); if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); return json({ metrics: await getGSCMetricsBySilo(seg[1]), project_id: seg[1] }); }
      // Silos
      case path === 'silos' && m === 'GET': return json(await getSilosByProject(url.searchParams.get('project_id') || ''));
      case path === 'silos' && m === 'POST': { const d = await body(req); await createSilo(d); return json({ ok: true }); }
      case seg[0] === 'silos' && seg.length === 2 && m === 'GET': return json(await getSilosByProject(seg[1]));
      case seg[0] === 'silos' && seg.length === 2 && isUUID(seg[1]) && m === 'PUT': { const d = await body(req); await updateSilo(seg[1], d); return json({ ok: true }); }
      case seg[0] === 'silos' && seg.length === 2 && isUUID(seg[1]) && m === 'DELETE': await deleteSilo(seg[1]); return json({ ok: true });
      // Pages
      case path === 'pages' && m === 'GET': return json(await getPagesByProject(url.searchParams.get('project_id') || ''));
      case path === 'pages' && m === 'POST': { const d = await body(req); await createPage(d); return json({ ok: true }); }
      case seg[0] === 'pages' && seg.length === 2 && m === 'GET': return json(await getPagesByProject(seg[1]));
      case seg[0] === 'pages' && seg.length === 2 && isUUID(seg[1]) && m === 'PUT': { const d = await body(req); await updatePage(seg[1], d); return json({ ok: true }); }
      case seg[0] === 'pages' && seg.length === 2 && isUUID(seg[1]) && m === 'DELETE': await deletePage(seg[1]); return json({ ok: true });
      // Internal Links
      case path === 'internal-links' && m === 'GET': return json(await getInternalLinksByProject(url.searchParams.get('project_id') || ''));
      case path === 'internal-links' && m === 'POST': { const d = await body(req); if (d.links && Array.isArray(d.links)) { const projectId = d.projectId || d.project_id || ''; let saved = 0; for (const link of d.links) { await createInternalLink({ id: crypto.randomUUID(), project_id: projectId, from_page_id: link.from || link.from_page_id || '', to_page_id: link.to || link.to_page_id || '', anchor: link.anchor || '' }); saved++; } return json({ ok: true, saved }); } else { await createInternalLink(d); return json({ ok: true }); } }
      case path === 'internal-links' && m === 'DELETE': await deleteInternalLink(url.searchParams.get('id') || ''); return json({ ok: true });
      // Auth
      case path === 'auth/login' && m === 'POST': { const { email, password: pw } = await body(req); const u = await getUserByEmail(email); if (!u || !(await verifyPassword(pw, u.password_hash, u.salt))) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 }); const t = await createToken({ userId: u.id, email: u.email, role: u.role }); return json({ token: t, user: { id: u.id, email: u.email, name: u.name, role: u.role } }); }
      case path === 'auth/me' && m === 'GET': { const u = await getUserFromRequest(req); if (!u) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const dbU = await getUserById(u.userId); return json({ user: dbU ? { id: dbU.id, email: dbU.email, name: dbU.name, role: dbU.role } : null }); }
      case path === 'auth/logout' && m === 'POST': return json({ ok: true });
      case path === 'auth/change-password' && m === 'POST': { const u = await getUserFromRequest(req); if (!u) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const { current_password, new_password } = await body(req); const dbU = await getUserById(u.userId); if (!dbU || !(await verifyPassword(current_password, dbU.password_hash, dbU.salt))) return NextResponse.json({ error: 'Invalid password' }, { status: 401 }); const { hash, salt } = await hashPassword(new_password); await updateUser(u.userId, { password_hash: hash, salt }); return json({ ok: true }); }
      // Users
      case path === 'users' && m === 'GET': return json(await getAllUsers());
      case path === 'users' && m === 'POST': { const { email, password: pw, name, role } = await body(req); const { hash, salt } = await hashPassword(pw); await createUser({ id: crypto.randomUUID(), email, password_hash: hash, salt, name, role }); return json({ ok: true }); }
      case seg[0] === 'users' && seg.length === 2 && isUUID(seg[1]) && m === 'PUT': { const d = await body(req); if (d.password) { const { hash, salt } = await hashPassword(d.password); d.password_hash = hash; d.salt = salt; delete d.password; } await updateUser(seg[1], d); return json({ ok: true }); }
      case seg[0] === 'users' && seg.length === 2 && isUUID(seg[1]) && m === 'DELETE': await deleteUser(seg[1]); return json({ ok: true });
      // Settings
      case path === 'settings' && m === 'GET': { const u = await getUserFromRequest(req); return json(u ? await getAISettingsByUser(u.userId) : []); }
      case path === 'settings' && m === 'POST': { const u = await getUserFromRequest(req); if (!u) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const d = await body(req); await upsertAISetting({ id: d.id || crypto.randomUUID(), user_id: u.userId, provider: d.provider || '', api_key: d.api_key || '', model: d.model || '', is_active: d.is_active ?? 1 }); return json({ ok: true }); }
      case path === 'settings' && m === 'PUT': { const d = await body(req); const u = await getUserFromRequest(req); if (!u) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); if (d.id) await setActiveAISetting(d.id, u.userId); return json({ ok: true }); }
      case path === 'settings' && m === 'DELETE': { const d = await body(req); await deleteAISetting(d.id || url.searchParams.get('id') || ''); return json({ ok: true }); }
      // AI
      case path === 'ai/expand-keywords' && m === 'POST': { const d = await body(req); const result = await expandKeywords(d.seedKeywords || d.keywords, d.niche, d.language, req); return json({ keywords: result }); }
      case path === 'ai/generate-silos' && m === 'POST': { const d = await body(req); const silos = await generateSilos(d.niche, d.keywords, d.language, req); return json({ silos }); }
      case path === 'ai/generate-pages' && m === 'POST': { const d = await body(req); const result = await generatePages(d.silos, d.niche, d.language, req, d.seedKeywords); return json(result); }
      case path === 'ai/keyword-cluster' && m === 'POST': { const d = await body(req); const result = await groupKeywords(d.keywords, d.niche, req); return json({ clusters: result }); }
      case path === 'ai/search-intent' && m === 'POST': { const d = await body(req); const result = await mapSearchIntent(d.keywords, req); return json({ intents: result }); }
      case path === 'ai/content-gap' && m === 'POST': { const d = await body(req); const result = await analyzeContentGap(d.userSilos, d.competitorSilos, d.niche, req); return json({ gaps: result }); }
      case path === 'ai/content-brief' && m === 'POST': { const d = await body(req); const result = await generateContentBrief(d.title || d.pageTitle, d.type || d.pageType, d.siloName, d.keywords, d.siblingPages || [], d.niche, req); return json({ brief: result }); }
      case path === 'ai/generate-article' && m === 'POST': { const d = await body(req); const sc = d.siloContext || {}; const safeSiloContext = { siloName: sc.siloName || 'General', pillarPage: sc.pillarPage || null, siblingPages: Array.isArray(sc.siblingPages) ? sc.siblingPages : [], internalLinks: Array.isArray(sc.internalLinks) ? sc.internalLinks : [], brandVoice: sc.brandVoice || 'Professional and authoritative', niche: sc.niche || '', searchIntent: sc.searchIntent || 'Informational', suggestedAnchor: sc.suggestedAnchor || undefined, }; const result = await generateSiloAwareArticle(d.pageTitle || d.title, d.pageType || d.type, d.pageKeywords || d.keywords || [], safeSiloContext, d.wordCountTarget || 2000, req); return json({ article: result }); }
      case path === 'ai/internal-links' && m === 'POST': { const d = await body(req); const result = await suggestInternalLinks(d.pages, d.silos, req); return json(result); }
      case path === 'ai/humanize-content' && m === 'POST': { const d = await body(req); const result = await humanizeContent(d.content, d.level, d.contentType, d.preserveKeywords !== false, req); return json({ result }); }
      case path === 'ai/serp-features' && m === 'POST': { const d = await body(req); const keywords = Array.isArray(d.keywords) ? d.keywords : (d.keywords || '').split('\n').map((k: string) => k.trim()).filter(Boolean); const results = await analyzeSERPFeatures(keywords, d.niche || '', d.domain || '', req); return json({ results }); }
      case path === 'ai/bulk-generate' && m === 'POST': { const d = await body(req); const safeBulkContext = { siloName: d.siloName || 'General', pillarPage: null, siblingPages: [], internalLinks: [], brandVoice: d.brandVoice || 'Professional and authoritative', niche: d.niche || '', searchIntent: 'Informational', suggestedAnchor: undefined, }; const result = await generateSiloAwareArticle(d.pages?.[0]?.title || '', d.pages?.[0]?.type || 'pillar', d.pages?.[0]?.keywords || [], safeBulkContext, 2000, req); return json({ article: result }); }
      // Import/Export
      case path === 'import-competitor' && m === 'POST': return await handleImportCompetitor(req);
      case path === 'import-csv' && m === 'POST': { const contentType = req.headers.get('content-type') || ''; let imported = 0; const errors: string[] = []; const rows: Record<string, string>[] = []; if (contentType.includes('multipart/form-data') || contentType.includes('form-data')) { const formData = await req.formData(); const file = formData.get('file') as File | null; const projectId = (formData.get('project_id') as string) || ''; if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 }); const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 }); const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '')); for (let i = 1; i < lines.length; i++) { const values: string[] = []; let current = ''; let inQuotes = false; for (const ch of lines[i]) { if (ch === '"') { inQuotes = !inQuotes; } else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; } else { current += ch; } } values.push(current.trim()); const row: Record<string, string> = {}; headers.forEach((h, idx) => { row[h] = values[idx] || ''; }); rows.push(row); } if (projectId) { await processInBatches(rows, BATCH_SIZES.DB_WRITES, async (p: Record<string, string>) => { try { await createPage({ id: crypto.randomUUID(), project_id: projectId, silo_id: p.silo_id || p.parent_silo_id || null, title: p.title || 'Untitled', slug: p.slug || p.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled', meta_description: p.meta_description || '', keywords: p.keywords || '', type: p.type || 'cluster', status: p.status || 'draft' }); imported++; } catch (e: unknown) { errors.push(`Row ${i}: ${e instanceof Error ? e.message : 'Error'}`); } }); return json({ imported, errors, rows: rows.map(r => ({ ...r, _imported: true })) }); } else { return json({ rows, errors, imported: 0 }); } } else { const d = await body(req); await processInBatches(d.pages || [], BATCH_SIZES.DB_WRITES, async (p: Record<string, unknown>) => { await createPage({ id: crypto.randomUUID(), project_id: d.project_id, silo_id: p.silo_id || null, title: p.title, slug: p.slug, meta_description: p.meta_description, keywords: p.keywords?.join?.(', ') || p.keywords || '', type: p.type || 'cluster', status: 'draft' }); imported++; }); return json({ imported }); } }
      case path === 'export-csv' && m === 'GET': { const pid = url.searchParams.get('project_id'); if (!pid) return NextResponse.json({ error: 'project_id required' }, { status: 400 }); const pages = await getPagesByProject(pid); const silos = await getSilosByProject(pid); const header = 'title,slug,meta_description,keywords,type,silo,status'; const rows = (pages as Array<Record<string, unknown>>).map(p => { const s = silos.find((si: Record<string, unknown>) => si.id === p.silo_id); return `"${p.title}","${p.slug}","${p.meta_description || ''}","${p.keywords || ''}","${p.type}","${s?.name || ''}","${p.status || 'draft'}"`; }); return new Response([header, ...rows].join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=siloforge-export.csv' } }); }
      // GSC
      case path === 'gsc-sync' && m === 'POST': return await handleGscSync(req);
      case path === 'gsc-auth' && m === 'GET': { const u = await getUserFromRequest(req); if (!u) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const cid = getGSCE('GSC_CLIENT_ID'); if (!cid) return NextResponse.json({ error: 'GSC_CLIENT_ID not configured' }, { status: 500 }); const a = new URL('https://accounts.google.com/o/oauth2/v2/auth'); a.searchParams.set('client_id', cid); a.searchParams.set('redirect_uri', `${new URL(req.url).origin}/api/gsc-auth/callback`); a.searchParams.set('response_type', 'code'); a.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/webmasters'); a.searchParams.set('access_type', 'offline'); a.searchParams.set('prompt', 'consent'); a.searchParams.set('state', u.userId); return NextResponse.redirect(a.toString()); }
      case path === 'gsc-auth' && m === 'POST': { const { code } = await body(req); if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 }); const cid = getGSCE('GSC_CLIENT_ID'); const cs = getGSCE('GSC_CLIENT_SECRET'); if (!cid || !cs) return NextResponse.json({ error: 'GSC OAuth not configured' }, { status: 500 }); const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: cid, client_secret: cs, redirect_uri: `${new URL(req.url).origin}/api/gsc-auth/callback`, grant_type: 'authorization_code' }) }); if (!tr.ok) return NextResponse.json({ error: 'Token exchange failed' }, { status: 400 }); return json(await tr.json()); }
      case path === 'gsc-auth/callback' && m === 'GET': { const code = url.searchParams.get('code'); const err = url.searchParams.get('error'); const o = new URL(req.url).origin; if (err || !code) return NextResponse.redirect(`${o}/?gsc_error=${err || 'no_code'}`); const cid = getGSCE('GSC_CLIENT_ID'); const cs = getGSCE('GSC_CLIENT_SECRET'); if (!cid || !cs) return NextResponse.redirect(`${o}/?gsc_error=config_missing`); const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: cid, client_secret: cs, redirect_uri: `${o}/api/gsc-auth/callback`, grant_type: 'authorization_code' }) }); if (!tr.ok) return NextResponse.redirect(`${o}/?gsc_error=token_failed`); const td = await tr.json(); const f = new URL('/', o); f.hash = `gsc_access_token=${encodeURIComponent(td.access_token)}&gsc_refresh_token=${encodeURIComponent(td.refresh_token || '')}&gsc_expires_in=${td.expires_in || 3600}`; return NextResponse.redirect(f.toString()); }
      // CMS
      case path === 'cms' && m === 'POST': { const { type, url: cu, api_key, username, password: pw, content } = await body(req); if (type === 'wordpress') { const r = await fetch(`${cu}/wp-json/wp/v2/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${username}:${pw}`)}` }, body: JSON.stringify({ title: content.title, content: content.body, status: 'draft' }) }); return r.ok ? json({ ok: true, result: await r.json() }) : NextResponse.json({ error: 'WP push failed' }, { status: 502 }); } const r = await fetch(cu, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(api_key ? { 'X-API-Key': api_key } : {}) }, body: JSON.stringify(content) }); return r.ok ? json({ ok: true, result: await r.json() }) : NextResponse.json({ error: 'Push failed' }, { status: 502 }); }
      default: return NextResponse.json({ error: 'Not found', path }, { status: 404 });
    }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : 'Internal error'; console.error(`[API /${path}]:`, msg); return NextResponse.json({ error: msg }, { status: 500 }); }
}

async function handleImportCompetitor(req: NextRequest) {
  const user = await getUserFromRequest(req); if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { target_url, project_name, max_pages, language } = await body(req);
  if (!target_url) return NextResponse.json({ error: 'target_url required' }, { status: 400 });
  let parsed: URL; try { parsed = new URL(target_url); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }
  const domain = parsed.hostname;
  const siteData = await scrapeCompetitorSite(target_url, max_pages || 50, BATCH_SIZES.URL_SCRAPING);
  const payload = buildScrapedPayloadForAI(siteData);
  const aiResult = await retryWithBackoff(() => callAI([
    { role: 'system', content: `You are an SEO silo architect. Return ONLY JSON: {"niche":"...","silos":[{"name":"Silo","keywords":["k1"],"pillar":{"title":"Pillar","slug":"slug","meta_description":"desc","keywords":["k1"]},"clusters":[{"title":"C","slug":"c","meta_description":"d","keywords":["k1"]}],"blogs":[{"title":"B","slug":"b","meta_description":"d","keywords":["k1"]}]}]}. 3-8 silos, 1 pillar, 2-5 clusters, 1-3 blogs each. Language: ${language || 'en'}` },
    { role: 'user', content: `Map silo architecture for ${domain}:\n${payload}` },
  ], req), 2, 1500);
  let mapped: { niche: string; silos: Array<{ name: string; keywords: string[]; pillar: { title: string; slug: string; meta_description: string; keywords: string[] }; clusters: Array<{ title: string; slug: string; meta_description: string; keywords: string[] }>; blogs: Array<{ title: string; slug: string; meta_description: string; keywords: string[] }> }> };
  try { mapped = JSON.parse(aiResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { return NextResponse.json({ error: 'AI invalid response' }, { status: 500 }); }
  const pid = crypto.randomUUID();
  await createProject({ id: pid, name: project_name || `Competitor: ${domain}`, domain, language: language || 'en', niche: mapped.niche, seed_keywords: mapped.silos.flatMap(s => s.keywords).join(', '), user_id: user.userId });
  let sc = 0, pc = 0;
  await processInBatches(mapped.silos, BATCH_SIZES.DB_WRITES, async (silo) => {
    const sid = crypto.randomUUID();
    await createSilo({ id: sid, project_id: pid, name: silo.name, keywords: silo.keywords.join(', ') }); sc++;
    if (silo.pillar) { await createPage({ id: crypto.randomUUID(), project_id: pid, silo_id: sid, title: silo.pillar.title, slug: silo.pillar.slug, meta_description: silo.pillar.meta_description, keywords: silo.pillar.keywords.join(', '), type: 'pillar', status: 'draft' }); pc++; }
    for (const c of silo.clusters || []) { await createPage({ id: crypto.randomUUID(), project_id: pid, silo_id: sid, title: c.title, slug: c.slug, meta_description: c.meta_description, keywords: c.keywords.join(', '), type: 'cluster', status: 'draft' }); pc++; }
    for (const b of silo.blogs || []) { await createPage({ id: crypto.randomUUID(), project_id: pid, silo_id: sid, title: b.title, slug: b.slug, meta_description: b.meta_description, keywords: b.keywords.join(', '), type: 'blog', status: 'draft' }); pc++; }
  });
  return json({ project_id: pid, silos_created: sc, pages_created: pc, domain, niche: mapped.niche, pages_crawled: 1 + siteData.crawledPages.length });
}

async function handleGscSync(req: NextRequest) {
  const user = await getUserFromRequest(req); if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { project_id, access_token, site_url, start_date, end_date, row_limit } = await body(req);
  if (!project_id || !access_token) return NextResponse.json({ error: 'project_id and access_token required' }, { status: 400 });
  const project = await getProjectById(project_id); if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const pUrl = site_url || (project as Record<string, unknown>).domain as string;
  const eDate = end_date || new Date().toISOString().split('T')[0];
  const sDate = start_date || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const encUrl = encodeURIComponent(pUrl.startsWith('http') ? pUrl : `https://${pUrl}`);
  const gscRes = await retryWithBackoff(async () => { const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encUrl}/searchAnalytics/query`, { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: sDate, endDate: eDate, dimensions: ['page'], rowLimit: Math.min(row_limit || 5000, 25000), type: 'web' }) }); if (!r.ok) throw new Error(`GSC error (${r.status})`); return r.json(); }, 2, 1000);
  const rows = gscRes.rows || [];
  const pm = new Map<string, { clicks: number; impressions: number; positionSum: number; count: number }>();
  for (const row of rows) { const u = row.keys?.[0]; if (!u) continue; const ex = pm.get(u) || { clicks: 0, impressions: 0, positionSum: 0, count: 0 }; ex.clicks += row.clicks || 0; ex.impressions += row.impressions || 0; ex.positionSum += (row.position || 0) * (row.impressions || 1); ex.count++; pm.set(u, ex); }
  const pages = await getPagesByProject(project_id) as Array<Record<string, unknown>>;
  let synced = 0;
  await processInBatches(Array.from(pm.entries()), BATCH_SIZES.DB_WRITES, async ([pu, metrics]) => {
    const slug = new URL(pu).pathname.replace(/^\/|\/$/g, '').split('/').pop() || '';
    const match = pages.find(p => (p.slug as string) === slug);
    if (match) { await updatePageGSCMetrics(match.id as string, { clicks: metrics.clicks, impressions: metrics.impressions, position: metrics.impressions > 0 ? metrics.positionSum / metrics.impressions : 0, ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0 }); synced++; }
  });
  return json({ synced_pages: synced, total_pages: pages.length, gsc_rows_fetched: rows.length, date_range: { start: sDate, end: eDate } });
}

function getGSCE(name: string): string | null {
  try { // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@cloudflare/next-on-pages').getRequestContext(); return env?.[name] || process.env[name] || null; } catch { return process.env[name] || null; }
}

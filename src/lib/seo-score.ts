// SEO Score calculation utility
// Scores a page based on SEO best practices

export interface SEOScoreResult {
  score: number;       // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: {
    hasTitle: boolean;
    hasSlug: boolean;
    hasMetaDescription: boolean;
    metaDescLength: boolean;    // 150-160 chars
    hasKeywords: boolean;
    keywordCount: boolean;      // 3-5 keywords
    hasSilo: boolean;
    hasType: boolean;
    slugFormat: boolean;        // lowercase, hyphens only
    titleLength: boolean;       // under 60 chars
  };
  suggestions: string[];
}

export function calculateSEOScore(page: {
  title: string;
  slug: string;
  metaDescription: string;
  keywords: string[];
  siloId: string | null;
  type: string;
  status?: string;
}): SEOScoreResult {
  // Guard against null/undefined values that may come from DB
  const title = page.title ?? '';
  const slug = page.slug ?? '';
  const metaDescription = page.metaDescription ?? '';
  const keywords = Array.isArray(page.keywords) ? page.keywords : [];

  const checks = {
    hasTitle: !!title && title.trim().length > 0,
    hasSlug: !!slug && slug.trim().length > 0,
    hasMetaDescription: !!metaDescription && metaDescription.trim().length > 0,
    metaDescLength: metaDescription.length >= 120 && metaDescription.length <= 160,
    hasKeywords: keywords.length > 0,
    keywordCount: keywords.length >= 3 && keywords.length <= 7,
    hasSilo: !!page.siloId,
    hasType: !!page.type,
    slugFormat: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug),
    titleLength: title.length > 0 && title.length <= 60,
  };

  // Weight each check
  const weights: Record<string, number> = {
    hasTitle: 20,
    hasSlug: 10,
    hasMetaDescription: 15,
    metaDescLength: 10,
    hasKeywords: 15,
    keywordCount: 10,
    hasSilo: 8,
    hasType: 4,
    slugFormat: 4,
    titleLength: 4,
  };

  let score = 0;
  for (const [key, passed] of Object.entries(checks)) {
    if (passed) score += weights[key] || 0;
  }

  // Generate suggestions
  const suggestions: string[] = [];
  if (!checks.hasTitle) suggestions.push('Add a page title');
  if (!checks.titleLength && checks.hasTitle) suggestions.push('Keep title under 60 characters for better SERP display');
  if (!checks.hasSlug) suggestions.push('Add a URL slug');
  if (!checks.slugFormat && checks.hasSlug) suggestions.push('Use lowercase letters and hyphens in slug (e.g., my-page-title)');
  if (!checks.hasMetaDescription) suggestions.push('Add a meta description (120-160 characters recommended)');
  if (!checks.metaDescLength && checks.hasMetaDescription) suggestions.push('Meta description should be 120-160 characters for optimal display');
  if (!checks.hasKeywords) suggestions.push('Add target keywords to improve SEO focus');
  if (!checks.keywordCount && checks.hasKeywords) suggestions.push('Use 3-7 target keywords for optimal SEO focus');
  if (!checks.hasSilo) suggestions.push('Assign this page to a silo for better site architecture');
  if (!checks.hasType) suggestions.push('Set a page type (pillar, cluster, blog, etc.)');

  const grade: SEOScoreResult['grade'] =
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 60 ? 'C' :
    score >= 40 ? 'D' : 'F';

  return { score, grade, checks, suggestions };
}

export function getScoreColor(grade: SEOScoreResult['grade']): string {
  switch (grade) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-green-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

export function getScoreBgColor(grade: SEOScoreResult['grade']): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500/20 border-emerald-500/30';
    case 'B': return 'bg-green-500/20 border-green-500/30';
    case 'C': return 'bg-yellow-500/20 border-yellow-500/30';
    case 'D': return 'bg-orange-500/20 border-orange-500/30';
    case 'F': return 'bg-red-500/20 border-red-500/30';
    default: return 'bg-slate-500/20 border-slate-500/30';
  }
}

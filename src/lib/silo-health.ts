// Silo Health Scoring Engine
// Evaluates each silo's structural integrity, internal linking, and completeness

export interface SiloHealthResult {
  siloId: string;
  siloName: string;
  score: number; // 0-100
  grade: 'healthy' | 'warning' | 'critical'; // green/yellow/red
  pillarCount: number;
  clusterCount: number;
  blogCount: number;
  totalPages: number;
  hasPillar: boolean;
  hasKeywords: boolean;
  orphanedPages: string[]; // page IDs not linked to silo properly
  bleedLinks: BleedLink[]; // cross-silo links that break silo rules
  issues: string[];
  suggestions: string[];
}

export interface BleedLink {
  fromPageId: string;
  fromPageTitle: string;
  fromSiloId: string;
  toPageId: string;
  toPageTitle: string;
  toSiloId: string;
  anchor: string;
}

export interface InternalLink {
  fromPageId: string;
  toPageId: string;
  anchor: string;
}

export function calculateSiloHealth(
  silo: { id: string; name: string; keywords: string[] },
  pages: Array<{
    id: string;
    siloId: string | null;
    title: string;
    type: string;
    keywords: string[];
    metaDescription: string;
    slug: string;
  }>,
  internalLinks?: InternalLink[]
): SiloHealthResult {
  const siloPages = pages.filter(p => p.siloId === silo.id);
  const pillarPages = siloPages.filter(p => p.type === 'pillar');
  const clusterPages = siloPages.filter(p => p.type === 'cluster');
  const blogPages = siloPages.filter(p => p.type === 'blog');

  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // === Structural Checks (40 points) ===

  // Has at least one pillar page (15 pts)
  const hasPillar = pillarPages.length > 0;
  if (hasPillar) {
    score += 15;
    // Bonus for exactly 1 pillar (ideal)
  } else {
    issues.push('No pillar page found');
    suggestions.push('Add a pillar page as the authoritative hub for this silo');
  }

  // Multiple pillar pages is bad (deduct)
  if (pillarPages.length > 1) {
    issues.push(`${pillarPages.length} pillar pages found (should be 1)`);
    suggestions.push('Consolidate pillar pages into a single comprehensive guide');
    score -= 5;
  }

  // Has cluster pages (10 pts)
  if (clusterPages.length >= 2) {
    score += 10;
  } else if (clusterPages.length === 1) {
    score += 5;
    suggestions.push('Add more cluster pages to strengthen the silo');
  } else {
    issues.push('No cluster pages found');
    suggestions.push('Add 2-4 cluster pages that link back to the pillar');
  }

  // Has blog posts (5 pts)
  if (blogPages.length >= 2) {
    score += 5;
  } else if (blogPages.length === 1) {
    score += 3;
    suggestions.push('Add more blog posts to support the silo with fresh content');
  } else {
    suggestions.push('Add blog posts to drive topical traffic to the silo');
  }

  // Total pages minimum (10 pts)
  const totalPages = siloPages.length;
  if (totalPages >= 7) {
    score += 10;
  } else if (totalPages >= 4) {
    score += 5;
    suggestions.push('Expand the silo with more supporting pages for better topical authority');
  } else if (totalPages >= 2) {
    score += 2;
    suggestions.push('This silo is too thin - aim for at least 7 pages for strong topical authority');
  } else {
    issues.push('Silo has fewer than 2 pages');
    suggestions.push('Add more pages to this silo to establish topical authority');
  }

  // === Keyword Checks (25 points) ===

  // Silo has keywords (10 pts)
  const hasKeywords = silo.keywords.length > 0;
  if (hasKeywords) {
    score += 10;
  } else {
    issues.push('No keywords assigned to silo');
    suggestions.push('Assign target keywords to this silo');
  }

  // Pages have keywords (10 pts)
  const pagesWithKeywords = siloPages.filter(p => p.keywords.length > 0);
  const keywordCoverage = totalPages > 0 ? pagesWithKeywords.length / totalPages : 0;
  if (keywordCoverage >= 0.8) {
    score += 10;
  } else if (keywordCoverage >= 0.5) {
    score += 5;
    suggestions.push(`${Math.round((1 - keywordCoverage) * 100)}% of pages lack keywords`);
  } else {
    issues.push('Most pages lack target keywords');
    suggestions.push('Add target keywords to all pages in this silo');
  }

  // Meta description coverage (5 pts)
  const pagesWithMeta = siloPages.filter(p => p.metaDescription && p.metaDescription.length >= 120);
  const metaCoverage = totalPages > 0 ? pagesWithMeta.length / totalPages : 0;
  if (metaCoverage >= 0.8) {
    score += 5;
  } else if (metaCoverage >= 0.5) {
    score += 2;
  }

  // === Linking Checks (20 points) ===

  // Detect bleed links (cross-silo links that bypass pillar)
  const bleedLinks: BleedLink[] = [];
  if (internalLinks && internalLinks.length > 0) {
    for (const link of internalLinks) {
      const fromPage = pages.find(p => p.id === link.fromPageId);
      const toPage = pages.find(p => p.id === link.toPageId);
      if (fromPage && toPage && fromPage.siloId === silo.id && toPage.siloId && toPage.siloId !== silo.id) {
        // Cross-silo link from this silo to another
        // It's a "bleed" if it's from a non-pillar page directly to another non-pillar page
        if (fromPage.type !== 'pillar' && toPage.type !== 'pillar') {
          bleedLinks.push({
            fromPageId: link.fromPageId,
            fromPageTitle: fromPage.title,
            fromSiloId: fromPage.siloId!,
            toPageId: link.toPageId,
            toPageTitle: toPage.title,
            toSiloId: toPage.siloId,
            anchor: link.anchor,
          });
        }
      }
    }
  }

  // Deduct for bleed links
  if (bleedLinks.length === 0) {
    score += 10;
  } else if (bleedLinks.length <= 2) {
    score += 5;
    issues.push(`${bleedLinks.length} silo bleed link(s) detected`);
    suggestions.push('Cross-silo links should go through pillar pages, not directly between supporting pages');
  } else {
    issues.push(`${bleedLinks.length} silo bleed links detected - link equity is leaking`);
    suggestions.push('Fix cross-silo links to flow through pillar pages for proper link equity distribution');
  }

  // Orphaned pages detection (pages with no internal links pointing to them)
  const orphanedPages: string[] = [];
  if (internalLinks && internalLinks.length > 0) {
    for (const page of siloPages) {
      const hasIncomingLink = internalLinks.some(l => l.toPageId === page.id);
      if (!hasIncomingLink && page.type !== 'pillar') {
        orphanedPages.push(page.id);
      }
    }
  }

  if (orphanedPages.length === 0) {
    score += 10;
  } else if (orphanedPages.length <= 2) {
    score += 5;
    issues.push(`${orphanedPages.length} orphaned page(s) with no incoming internal links`);
    suggestions.push('Add internal links pointing to these pages from the pillar or cluster pages');
  } else {
    issues.push(`${orphanedPages.length} orphaned pages - they receive no link equity`);
    suggestions.push('Build internal links to orphaned pages to integrate them into the silo');
  }

  // === Content Quality (15 points) ===

  // Title quality (5 pts)
  const goodTitles = siloPages.filter(p => p.title.length > 10 && p.title.length <= 60);
  if (totalPages > 0 && goodTitles.length / totalPages >= 0.7) {
    score += 5;
  } else {
    suggestions.push('Optimize page titles to be 10-60 characters');
  }

  // Slug quality (5 pts)
  const goodSlugs = siloPages.filter(p => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug));
  if (totalPages > 0 && goodSlugs.length / totalPages >= 0.8) {
    score += 5;
  } else {
    suggestions.push('Fix URL slugs to use lowercase letters and hyphens only');
  }

  // Type distribution (5 pts)
  const hasGoodDistribution = pillarPages.length >= 1 && clusterPages.length >= 2 && blogPages.length >= 2;
  if (hasGoodDistribution) {
    score += 5;
  } else {
    suggestions.push('Aim for a mix of 1 pillar, 2-4 cluster, and 2-4 blog pages per silo');
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  const grade: SiloHealthResult['grade'] =
    score >= 75 ? 'healthy' :
    score >= 45 ? 'warning' : 'critical';

  return {
    siloId: silo.id,
    siloName: silo.name,
    score,
    grade,
    pillarCount: pillarPages.length,
    clusterCount: clusterPages.length,
    blogCount: blogPages.length,
    totalPages,
    hasPillar,
    hasKeywords,
    orphanedPages,
    bleedLinks,
    issues,
    suggestions,
  };
}

export function getHealthColor(grade: SiloHealthResult['grade']): string {
  switch (grade) {
    case 'healthy': return 'text-emerald-400';
    case 'warning': return 'text-yellow-400';
    case 'critical': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

export function getHealthBgColor(grade: SiloHealthResult['grade']): string {
  switch (grade) {
    case 'healthy': return 'bg-emerald-500/20 border-emerald-500/30';
    case 'warning': return 'bg-yellow-500/20 border-yellow-500/30';
    case 'critical': return 'bg-red-500/20 border-red-500/30';
    default: return 'bg-slate-500/20 border-slate-500/30';
  }
}

export function getHealthDot(grade: SiloHealthResult['grade']): string {
  switch (grade) {
    case 'healthy': return 'bg-emerald-500';
    case 'warning': return 'bg-yellow-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-slate-500';
  }
}

// Detect keyword cannibalization within a silo
export function detectCannibalization(
  pages: Array<{ id: string; title: string; keywords: string[]; siloId: string | null }>,
  siloId: string
): Array<{ keyword: string; pages: Array<{ id: string; title: string }> }> {
  const siloPages = pages.filter(p => p.siloId === siloId);
  const keywordMap: Record<string, Array<{ id: string; title: string }>> = {};

  for (const page of siloPages) {
    for (const kw of page.keywords) {
      const normalizedKw = kw.toLowerCase().trim();
      if (!keywordMap[normalizedKw]) keywordMap[normalizedKw] = [];
      keywordMap[normalizedKw].push({ id: page.id, title: page.title });
    }
  }

  return Object.entries(keywordMap)
    .filter(([, pgs]) => pgs.length > 1)
    .map(([keyword, pgs]) => ({ keyword, pages: pgs }));
}

// Analyze anchor text distribution across all internal links
export function analyzeAnchorTextDistribution(
  links: InternalLink[]
): Array<{ anchor: string; count: number; percentage: number }> {
  const anchorCounts: Record<string, number> = {};
  for (const link of links) {
    const normalizedAnchor = link.anchor.toLowerCase().trim();
    anchorCounts[normalizedAnchor] = (anchorCounts[normalizedAnchor] || 0) + 1;
  }

  const total = links.length || 1;
  return Object.entries(anchorCounts)
    .map(([anchor, count]) => ({ anchor, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

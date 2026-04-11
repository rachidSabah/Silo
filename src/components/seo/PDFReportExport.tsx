'use client';

import { useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { calculateSEOScore, getScoreColor } from '@/lib/seo-score';
import { calculateSiloHealth, getHealthColor } from '@/lib/silo-health';
import {
  FileDown, Loader2, CheckCircle2, AlertTriangle,
  BarChart3, Layers, FileText, Target, TrendingUp,
} from 'lucide-react';

export default function PDFReportExport() {
  const { project, silos, pages, internalLinks, gscSiloMetrics } = useStore();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Calculate report data
  const seoScores = pages.map(p => calculateSEOScore(p));
  const avgScore = seoScores.length > 0
    ? Math.round(seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length)
    : 0;

  const siloHealthResults = silos.map(silo =>
    calculateSiloHealth(silo, pages, internalLinks.map(l => ({
      fromPageId: l.fromPageId,
      toPageId: l.toPageId,
      anchor: l.anchor,
    })))
  );
  const avgSiloHealth = siloHealthResults.length > 0
    ? Math.round(siloHealthResults.reduce((sum, h) => sum + h.score, 0) / siloHealthResults.length)
    : 0;

  // Intent distribution
  const intentDist: Record<string, number> = {};
  pages.forEach(p => {
    const type = p.type || 'other';
    intentDist[type] = (intentDist[type] || 0) + 1;
  });

  // Silo coverage
  const silosWithPillar = silos.filter(s =>
    pages.some(p => p.siloId === s.id && p.type === 'pillar')
  ).length;

  const totalClicks = gscSiloMetrics.reduce((sum, m) => sum + m.total_clicks, 0);
  const totalImpressions = gscSiloMetrics.reduce((sum, m) => sum + m.total_impressions, 0);

  const handleGeneratePDF = async () => {
    if (!reportRef.current) return;

    setGenerating(true);
    try {
      // Dynamic import of html2pdf.js (client-side only)
      const html2pdf = (await import('html2pdf.js')).default;

      const element = reportRef.current;

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `SiloForge-Report-${(project as Record<string, unknown>)?.name || project?.name || 'Project'}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait' as const,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      await html2pdf().set(opt).from(element).save();
      setGenerated(true);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('PDF generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <FileDown size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No Project Selected</p>
        <p className="text-sm">Load a project to generate a PDF report.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">PDF Report Export</h2>
        <p className="text-sm md:text-base text-slate-400">
          Generate a client-facing PDF summarizing the SEO health of{' '}
          <span className="text-blue-400">{project.name}</span>
        </p>
      </div>

      {/* Generate Button */}
      <div className="mb-6">
        <button
          onClick={handleGeneratePDF}
          disabled={generating || pages.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <FileDown size={16} />
              Generate PDF Report
            </>
          )}
        </button>
        {generated && (
          <span className="ml-3 text-emerald-400 text-sm flex items-center gap-1 inline-flex">
            <CheckCircle2 size={14} /> PDF downloaded!
          </span>
        )}
      </div>

      {/* Hidden PDF Content — rendered for html2pdf.js capture */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={reportRef} style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#1a1a2e',
          background: '#ffffff',
          padding: '30px',
          maxWidth: '210mm',
          width: '210mm',
        }}>
          {/* Header / Cover */}
          <div style={{ borderBottom: '3px solid #3b82f6', paddingBottom: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e40af', margin: 0 }}>
                  SiloForge SEO Report
                </h1>
                <p style={{ fontSize: '16px', color: '#64748b', marginTop: '4px' }}>
                  {(project as Record<string, unknown>)?.name || project?.name}
                </p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  {(project as Record<string, unknown>)?.domain || project?.domain} | Generated: {new Date().toLocaleDateString()}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: avgScore >= 75 ? '#10b981' : avgScore >= 50 ? '#f59e0b' : '#ef4444' }}>
                  {avgScore}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>SEO Score</div>
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              Executive Summary
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
              This report provides a comprehensive overview of the SEO architecture for {(project as Record<string, unknown>)?.name || project?.name}.
              The site is organized into <strong>{silos.length} content silos</strong> containing <strong>{pages.length} pages</strong>.
              The average SEO score is <strong>{avgScore}/100</strong> with an average silo health of <strong>{avgSiloHealth}/100</strong>.
              {totalClicks > 0 && ` Over the analyzed period, the site received ${totalClicks.toLocaleString()} clicks and ${totalImpressions.toLocaleString()} impressions from organic search.`}
              {silosWithPillar < silos.length && ` ${silos.length - silosWithPillar} silo(s) are missing a pillar page, which weakens topical authority.`}
            </p>
          </div>

          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <MetricBox label="Silos" value={silos.length.toString()} color="#8b5cf6" />
            <MetricBox label="Pages" value={pages.length.toString()} color="#3b82f6" />
            <MetricBox label="Keywords" value={(pages.reduce((sum, p) => sum + p.keywords.length, 0) + silos.reduce((sum, s) => sum + s.keywords.length, 0)).toString()} color="#f59e0b" />
            <MetricBox label="Avg SEO Score" value={`${avgScore}/100`} color={avgScore >= 75 ? '#10b981' : '#f59e0b'} />
          </div>

          {/* Silo Architecture */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              Silo Architecture Health
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Silo</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Score</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Pages</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Pillar</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Clusters</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Blogs</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Issues</th>
                </tr>
              </thead>
              <tbody>
                {siloHealthResults.map(hr => (
                  <tr key={hr.siloId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontWeight: '500' }}>{hr.siloName}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold', color: hr.score >= 75 ? '#10b981' : hr.score >= 45 ? '#f59e0b' : '#ef4444' }}>
                      {hr.score}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{hr.totalPages}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: hr.hasPillar ? '#10b981' : '#ef4444' }}>
                      {hr.pillarCount}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{hr.clusterCount}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{hr.blogCount}</td>
                    <td style={{ padding: '8px 10px', fontSize: '11px', color: hr.issues.length > 0 ? '#ef4444' : '#10b981' }}>
                      {hr.issues.length > 0 ? hr.issues[0] : 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Content Distribution */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            {/* Page Types */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af', marginBottom: '8px' }}>Page Type Distribution</h3>
              {Object.entries(intentDist).map(([type, count]) => {
                const pct = pages.length > 0 ? Math.round((count / pages.length) * 100) : 0;
                return (
                  <div key={type} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{type}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6', borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Status Pipeline */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af', marginBottom: '8px' }}>Content Pipeline</h3>
              {(['draft', 'in_progress', 'review', 'published'] as const).map(status => {
                const count = pages.filter(p => p.status === status).length;
                const pct = pages.length > 0 ? Math.round((count / pages.length) * 100) : 0;
                const colors: Record<string, string> = {
                  draft: '#94a3b8', in_progress: '#3b82f6', review: '#f59e0b', published: '#10b981'
                };
                return (
                  <div key={status} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: colors[status], borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* GSC Analytics (if available) */}
          {gscSiloMetrics.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                GSC Traffic Analytics
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Silo</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Clicks</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Impressions</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Avg Position</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {gscSiloMetrics.map(m => (
                    <tr key={m.silo_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontWeight: '500' }}>{m.silo_name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#3b82f6', fontWeight: 'bold' }}>{m.total_clicks.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.total_impressions.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: m.avg_position <= 10 ? '#10b981' : '#f59e0b' }}>{m.avg_position.toFixed(1)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.avg_ctr.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recommendations */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              Key Recommendations
            </h2>
            <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
              {siloHealthResults.flatMap(h => h.suggestions).slice(0, 10).map((suggestion, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: '#f59e0b', flexShrink: 0 }}>&#9679;</span>
                  <span style={{ color: '#475569' }}>{suggestion}</span>
                </div>
              ))}
              {seoScores.filter(s => s.score < 60).length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: '#ef4444', flexShrink: 0 }}>&#9679;</span>
                  <span style={{ color: '#475569' }}>
                    {seoScores.filter(s => s.score < 60).length} pages have critical SEO issues (score below 60). Review and fix titles, meta descriptions, and keywords.
                  </span>
                </div>
              )}
              {silosWithPillar < silos.length && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: '#ef4444', flexShrink: 0 }}>&#9679;</span>
                  <span style={{ color: '#475569' }}>
                    {silos.length - silosWithPillar} silo(s) need a pillar page. Pillar pages are essential for establishing topical authority.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
            Generated by SiloForge | {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()} |
            {(project as Record<string, unknown>)?.domain || project?.domain}
          </div>
        </div>
      </div>

      {/* Preview Section — visible to user */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5 mb-6">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-400" />
          Report Preview
        </h3>
        <p className="text-slate-400 text-sm mb-4">
          The PDF will include the following sections based on your current project data:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PreviewItem icon={<Layers size={16} />} label="Silo Architecture Health" desc={`${silos.length} silos analyzed`} />
          <PreviewItem icon={<Target size={16} />} label="SEO Score Summary" desc={`Average: ${avgScore}/100`} />
          <PreviewItem icon={<FileText size={16} />} label="Content Distribution" desc={`${pages.length} pages by type & status`} />
          <PreviewItem icon={<TrendingUp size={16} />} label="GSC Traffic Data" desc={gscSiloMetrics.length > 0 ? `${totalClicks.toLocaleString()} total clicks` : 'No data synced yet'} />
        </div>

        {pages.length === 0 && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-amber-300 text-sm">
              <AlertTriangle size={14} />
              <span>Add pages to your project first to generate a meaningful report.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function PreviewItem({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg">
      <div className="text-blue-400">{icon}</div>
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-slate-500 text-xs">{desc}</p>
      </div>
    </div>
  );
}

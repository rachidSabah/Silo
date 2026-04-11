'use client';

import { useState, useEffect } from 'react';
import { useStore, GSCSiloMetrics } from '@/store/useStore';
import {
  BarChart3, TrendingUp, Eye, MousePointer, Target,
  RefreshCw, ExternalLink, AlertTriangle, CheckCircle2,
  ArrowUpDown,
} from 'lucide-react';

export default function GSCAnalyticsDashboard() {
  const {
    project, silos, pages, token,
    gscSiloMetrics, gscSyncResult, gscSyncLoading,
    setGSCSiloMetrics, setGSCSyncResult, setGSCSyncLoading,
  } = useStore();

  const [accessToken, setAccessToken] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [sortField, setSortField] = useState<'clicks' | 'impressions' | 'position' | 'ctr'>('clicks');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Auto-detect GSC token from sessionStorage (set by OAuth callback)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedToken = sessionStorage.getItem('gsc_access_token');
    if (storedToken && !accessToken) {
      setAccessToken(storedToken);
    }
  }, []);

  // Load GSC metrics from API
  const loadGSCMetrics = async () => {
    if (!project || !token) return;

    try {
      const res = await fetch(`/api/projects/${(project as Record<string, unknown>).id || project.id}/gsc-metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGSCSiloMetrics(data.metrics || []);
      }
    } catch {
      // Silently fail — metrics might not exist yet
    }
  };

  useEffect(() => {
    loadGSCMetrics();
  }, [project?.id]);

  // Sync GSC data
  const handleSync = async () => {
    if (!project || !accessToken) return;

    setGSCSyncLoading(true);
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const res = await fetch('/api/gsc-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: (project as Record<string, unknown>).id || project.id,
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          row_limit: 5000,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setGSCSyncResult(data);
        // Reload metrics after sync
        await loadGSCMetrics();
      } else {
        alert(data.error || 'GSC sync failed');
      }
    } catch (error) {
      alert('GSC sync failed. Check your access token.');
    } finally {
      setGSCSyncLoading(false);
    }
  };

  // Sort metrics
  const sortedMetrics = [...gscSiloMetrics].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortDir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
  });

  // Aggregate totals
  const totalClicks = gscSiloMetrics.reduce((sum, m) => sum + m.total_clicks, 0);
  const totalImpressions = gscSiloMetrics.reduce((sum, m) => sum + m.total_impressions, 0);
  const avgPosition = gscSiloMetrics.length > 0
    ? gscSiloMetrics.reduce((sum, m) => sum + m.avg_position, 0) / gscSiloMetrics.length
    : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // Page-level GSC data
  const pagesWithGSC = pages.filter(p => (p as Record<string, unknown>).gsc_clicks as number > 0);
  const topPerformingPages = [...pagesWithGSC]
    .sort((a, b) => ((b as Record<string, unknown>).gsc_clicks as number) - ((a as Record<string, unknown>).gsc_clicks as number))
    .slice(0, 10);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <ArrowUpDown
      size={12}
      className={`inline ml-1 ${sortField === field ? 'text-blue-400' : 'text-slate-600'}`}
    />
  );

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart3 size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No Project Selected</p>
        <p className="text-sm">Load a project to view GSC analytics.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">GSC Analytics</h2>
        <p className="text-sm md:text-base text-slate-400">
          Google Search Console data at the Silo level for <span className="text-blue-400">{project.name}</span>
        </p>
      </div>

      {/* OAuth Token Input + Sync Controls */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5 mb-6">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <ExternalLink size={16} className="text-blue-400" />
          Connect Google Search Console
        </h3>
        <p className="text-slate-400 text-sm mb-4">
          Enter your Google OAuth access token with GSC read-only scope to sync traffic data.
          You can generate a token from the{' '}
          <a href="/api/gsc-auth" target="_blank" className="text-blue-400 hover:underline">
            GSC Auth endpoint
          </a>.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Google OAuth access token..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
          </select>
          <button
            onClick={handleSync}
            disabled={gscSyncLoading || !accessToken}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={gscSyncLoading ? 'animate-spin' : ''} />
            {gscSyncLoading ? 'Syncing...' : 'Sync GSC Data'}
          </button>
        </div>

        {/* Last sync result */}
        {gscSyncResult && (
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-emerald-300 text-sm">
              <CheckCircle2 size={14} />
              <span>
                Synced {gscSyncResult.synced_pages}/{gscSyncResult.total_pages} pages
                ({gscSyncResult.gsc_rows_fetched} GSC rows fetched)
              </span>
            </div>
            <div className="text-slate-400 text-xs mt-1">
              Date range: {gscSyncResult.date_range.start} to {gscSyncResult.date_range.end}
            </div>
          </div>
        )}
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <MetricCard
          icon={<MousePointer size={18} />}
          label="Total Clicks"
          value={totalClicks.toLocaleString()}
          color="blue"
        />
        <MetricCard
          icon={<Eye size={18} />}
          label="Total Impressions"
          value={totalImpressions.toLocaleString()}
          color="purple"
        />
        <MetricCard
          icon={<Target size={18} />}
          label="Avg Position"
          value={avgPosition.toFixed(1)}
          color="amber"
          lowerIsBetter
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="Avg CTR"
          value={`${avgCtr.toFixed(2)}%`}
          color="emerald"
        />
      </div>

      {/* Silo-level GSC Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5 mb-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-purple-400" />
          Performance by Silo
        </h3>

        {sortedMetrics.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No GSC data yet. Sync your Google Search Console data above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium py-2 px-2">Silo</th>
                  <th className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer" onClick={() => toggleSort('clicks')}>
                    Clicks <SortIcon field="clicks" />
                  </th>
                  <th className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer" onClick={() => toggleSort('impressions')}>
                    Impressions <SortIcon field="impressions" />
                  </th>
                  <th className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer" onClick={() => toggleSort('position')}>
                    Position <SortIcon field="position" />
                  </th>
                  <th className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer" onClick={() => toggleSort('ctr')}>
                    CTR <SortIcon field="ctr" />
                  </th>
                  <th className="text-right text-slate-400 font-medium py-2 px-2">Pages</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-2">Top Page</th>
                </tr>
              </thead>
              <tbody>
                {sortedMetrics.map((metric) => (
                  <tr key={metric.silo_id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-2.5 px-2 text-white font-medium">{metric.silo_name}</td>
                    <td className="py-2.5 px-2 text-right text-blue-400 font-medium">{metric.total_clicks.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right text-purple-400">{metric.total_impressions.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={metric.avg_position <= 10 ? 'text-emerald-400' : metric.avg_position <= 20 ? 'text-amber-400' : 'text-red-400'}>
                        {metric.avg_position.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-emerald-400">{metric.avg_ctr.toFixed(2)}%</td>
                    <td className="py-2.5 px-2 text-right text-slate-400">{metric.page_count}</td>
                    <td className="py-2.5 px-2 text-slate-300 text-xs truncate max-w-[200px]">
                      {metric.top_page ? `${metric.top_page.title} (${metric.top_page.clicks})` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top Performing Pages */}
      {topPerformingPages.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Top Performing Pages
          </h3>
          <div className="space-y-2">
            {topPerformingPages.map((page, idx) => {
              const p = page as Record<string, unknown>;
              return (
                <div key={page.id} className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-500 text-xs font-mono w-6">#{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{page.title}</p>
                      <p className="text-slate-500 text-xs">/{page.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs flex-shrink-0 ml-4">
                    <div className="text-center">
                      <div className="text-blue-400 font-bold">{((p.gsc_clicks as number) || 0).toLocaleString()}</div>
                      <div className="text-slate-500">clicks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-purple-400 font-bold">{((p.gsc_impressions as number) || 0).toLocaleString()}</div>
                      <div className="text-slate-500">impr.</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-bold ${((p.gsc_position as number) || 0) <= 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {((p.gsc_position as number) || 0).toFixed(1)}
                      </div>
                      <div className="text-slate-500">pos.</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, color, lowerIsBetter }: {
  icon: React.ReactNode; label: string; value: string; color: string; lowerIsBetter?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/20',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-3 md:p-4`}>
      <div className={`flex items-center gap-2 mb-2 ${iconColorMap[color]}`}>
        {icon}
        <span className="text-slate-400 text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-white text-xl md:text-2xl font-bold">
        {value}
        {lowerIsBetter && <span className="text-xs text-slate-500 ml-1">lower = better</span>}
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import dynamic from 'next/dynamic';

// Dynamic import Leaflet to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const GeoGridMap = dynamic(() => import('./GeoGridMap'), { ssr: false });

interface GeoGridScan {
  id: string;
  keyword: string;
  center_lat: number;
  center_lng: number;
  grid_size: number;
  radius: number;
  business_name: string | null;
  status: string;
  avg_rank: number | null;
  total_nodes: number | null;
  nodes_found: number | null;
  completed_at: string | null;
  created_at?: string;
}

export default function GeoGridTracker() {
  const { project, token } = useStore();
  const [scans, setScans] = useState<GeoGridScan[]>([]);
  const [selectedScan, setSelectedScan] = useState<GeoGridScan | null>(null);
  const [nodes, setNodes] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showNewScan, setShowNewScan] = useState(false);
  const [showCompetitors, setShowCompetitors] = useState(false);

  // New scan form
  const [keyword, setKeyword] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [gridSize, setGridSize] = useState(5);
  const [radius, setRadius] = useState(1.0);
  const [businessName, setBusinessName] = useState('');

  // Cost warning
  const totalNodes = gridSize * gridSize;
  const showCostWarning = totalNodes > 25;

  const authFetch = useCallback((url: string, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
    });
  }, [token]);

  // Load scans
  useEffect(() => {
    if (!project?.id) return;
    authFetch(`/api/geogrid/scans?project_id=${project.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setScans(data); })
      .catch(() => {});
  }, [project?.id, authFetch]);

  // Select a scan and load its nodes
  const handleSelectScan = async (scan: GeoGridScan) => {
    setSelectedScan(scan);
    try {
      const res = await authFetch(`/api/geogrid/nodes?scan_id=${scan.id}`);
      const data = await res.json();
      setNodes(Array.isArray(data) ? data : []);
    } catch { setNodes([]); }
  };

  // Run new scan
  const handleRunScan = async () => {
    if (!project?.id || !keyword || !centerLat || !centerLng) return;
    setScanning(true);
    try {
      const res = await authFetch('/api/geogrid/scan', {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id, keyword, center_lat: parseFloat(centerLat),
          center_lng: parseFloat(centerLng), grid_size: gridSize, radius,
          business_name: businessName || project.name,
        }),
      });
      const data = await res.json();
      if (data.scan) {
        setSelectedScan(data.scan);
        setNodes(data.nodes || []);
        setScans(prev => [data.scan, ...prev]);
        setShowNewScan(false);
      }
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  };

  // Get color for rank
  const getRankColor = (rank: number | null) => {
    if (rank === null) return '#6b7280'; // gray - not found
    if (rank <= 3) return '#22c55e';     // green - top 3
    if (rank <= 10) return '#eab308';    // yellow - 4-10
    if (rank <= 20) return '#ef4444';    // red - 10+
    return '#dc2626';                     // dark red - 20+
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            📍 GeoGrid Rank Tracker
          </h2>
          <p className="text-slate-400 text-sm mt-1">Visualize your local search ranking across a geographic grid</p>
        </div>
        <button
          onClick={() => setShowNewScan(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Scan
        </button>
      </div>

      {/* New Scan Modal */}
      {showNewScan && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">New GeoGrid Scan</h3>
              <button onClick={() => setShowNewScan(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Target Keyword *</label>
                <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g., plumber near me" className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Center Latitude *</label>
                  <input value={centerLat} onChange={e => setCenterLat(e.target.value)} placeholder="40.7128" className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Center Longitude *</label>
                  <input value={centerLng} onChange={e => setCenterLng(e.target.value)} placeholder="-74.0060" className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Business Name</label>
                <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={project?.name || 'Your Business'} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Grid Size: {gridSize}x{gridSize}</label>
                  <input type="range" min="3" max="9" step="2" value={gridSize} onChange={e => setGridSize(parseInt(e.target.value))} className="w-full" />
                  <p className="text-[10px] text-slate-500">{totalNodes} grid points</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Radius (miles): {radius}</label>
                  <input type="range" min="0.5" max="5" step="0.5" value={radius} onChange={e => setRadius(parseFloat(e.target.value))} className="w-full" />
                </div>
              </div>
            </div>

            {showCostWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-300 text-xs">
                ⚠️ Cost Warning: A {gridSize}x{gridSize} scan generates {totalNodes} data points, consuming {totalNodes} SERP API credits. Consider using a smaller grid (3x3 or 5x5) for testing.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowNewScan(false)} className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">Cancel</button>
              <button onClick={handleRunScan} disabled={scanning || !keyword || !centerLat || !centerLng} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                {scanning ? 'Scanning...' : `Run Scan (${totalNodes} nodes)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan History */}
      {scans.length > 0 && !selectedScan && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Previous Scans</h3>
          <div className="space-y-2">
            {scans.map(scan => (
              <button key={scan.id} onClick={() => handleSelectScan(scan)}
                className="w-full flex items-center justify-between p-3 bg-slate-900 rounded-lg hover:bg-slate-700/50 transition-colors text-left">
                <div>
                  <p className="text-white text-sm font-medium">{scan.keyword}</p>
                  <p className="text-slate-500 text-xs">{scan.grid_size}x{scan.grid_size} grid • {scan.radius}mi radius • {scan.business_name || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: getRankColor(scan.avg_rank) }}>
                    {scan.avg_rank ? `#${scan.avg_rank}` : 'N/A'}
                  </p>
                  <p className="text-slate-500 text-[10px]">{scan.status}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map View */}
      {selectedScan && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => { setSelectedScan(null); setNodes([]); }}
              className="text-slate-400 hover:text-white text-sm flex items-center gap-1">← Back to scans</button>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={showCompetitors} onChange={e => setShowCompetitors(e.target.checked)}
                  className="rounded bg-slate-700 border-slate-600" />
                Competitor Overlay
              </label>
            </div>
          </div>

          {/* Scan Summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Avg Rank', value: selectedScan.avg_rank ? `#${selectedScan.avg_rank}` : 'N/A', color: getRankColor(selectedScan.avg_rank) },
              { label: 'Visibility', value: selectedScan.nodes_found && selectedScan.total_nodes ? `${Math.round(selectedScan.nodes_found / selectedScan.total_nodes * 100)}%` : 'N/A', color: '#60a5fa' },
              { label: 'Grid', value: `${selectedScan.grid_size}x${selectedScan.grid_size}`, color: '#94a3b8' },
              { label: 'Keyword', value: selectedScan.keyword, color: '#c084fc' },
            ].map(stat => (
              <div key={stat.label} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-center">
                <p className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-[10px] text-slate-500 uppercase">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Leaflet Map */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden" style={{ height: '500px' }}>
            {typeof window !== 'undefined' && (
              <GeoGridMap
                centerLat={selectedScan.center_lat}
                centerLng={selectedScan.center_lng}
                nodes={nodes}
                showCompetitors={showCompetitors}
                getRankColor={getRankColor}
              />
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Ranks 1-3</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Ranks 4-10</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Ranks 10+</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-500 inline-block" /> Not Found</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {scans.length === 0 && !selectedScan && (
        <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
          <div className="text-5xl mb-4">📍</div>
          <h3 className="text-xl font-bold text-white mb-2">No GeoGrid Scans Yet</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">Run your first scan to visualize how your business ranks across different locations on Google Maps.</p>
          <button onClick={() => setShowNewScan(true)} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            Run First Scan
          </button>
        </div>
      )}
    </div>
  );
}

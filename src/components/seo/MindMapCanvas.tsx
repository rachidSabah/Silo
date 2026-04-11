'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useStore, type Silo, type Page } from '@/store/useStore';
import {
  calculateSiloHealth, getHealthDot, getHealthColor, detectCannibalization,
} from '@/lib/silo-health';
import PageTypeBadge from './PageTypeBadge';
import {
  Network, ZoomIn, ZoomOut, Maximize2, ArrowRight, AlertTriangle,
  ChevronDown, ChevronRight, XCircle, CheckCircle2, GripVertical,
} from 'lucide-react';

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'project' | 'silo' | 'page';
  siloColor?: string;
}

const siloColors = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#f43f5e',
];

export default function MindMapCanvas() {
  const { project, silos, pages, internalLinks, updatePage, setStep } = useStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [showCannibalization, setShowCannibalization] = useState(true);

  // Compute auto-layout positions
  const computedLayout = useMemo(() => {
    if (!project || silos.length === 0) return [];

    const positions: NodePosition[] = [];
    const centerX = 600;
    const centerY = 400;
    const siloRadius = 280;

    positions.push({
      id: project.id, x: centerX - 80, y: centerY - 25, width: 160, height: 50, type: 'project',
    });

    silos.forEach((silo, i) => {
      const angle = (2 * Math.PI * i) / silos.length - Math.PI / 2;
      const sx = centerX + Math.cos(angle) * siloRadius - 80;
      const sy = centerY + Math.sin(angle) * siloRadius - 25;

      positions.push({ id: silo.id, x: sx, y: sy, width: 160, height: 50, type: 'silo', siloColor: siloColors[i % siloColors.length] });

      const siloPages = pages.filter(p => p.siloId === silo.id);
      const pillar = siloPages.find(p => p.type === 'pillar');
      const clusters = siloPages.filter(p => p.type === 'cluster');
      const blogs = siloPages.filter(p => p.type === 'blog');
      const otherPages = siloPages.filter(p => !['pillar', 'cluster', 'blog'].includes(p.type));

      let yOffset = 0;
      if (pillar) {
        positions.push({ id: pillar.id, x: sx + 20, y: sy + 60 + yOffset, width: 120, height: 36, type: 'page', siloColor: siloColors[i % siloColors.length] });
        yOffset += 46;
      }
      clusters.forEach((page, j) => {
        const offset = (j - (clusters.length - 1) / 2) * 80;
        positions.push({ id: page.id, x: sx + offset - 20, y: sy + 60 + yOffset, width: 110, height: 32, type: 'page', siloColor: siloColors[i % siloColors.length] });
      });
      if (clusters.length > 0) yOffset += 42;
      blogs.forEach((page, j) => {
        const offset = (j - (blogs.length - 1) / 2) * 80;
        positions.push({ id: page.id, x: sx + offset - 20, y: sy + 60 + yOffset, width: 110, height: 32, type: 'page', siloColor: siloColors[i % siloColors.length] });
      });
      if (blogs.length > 0) yOffset += 42;
      otherPages.forEach((page, j) => {
        const offset = (j - (otherPages.length - 1) / 2) * 80;
        positions.push({ id: page.id, x: sx + offset - 20, y: sy + 60 + yOffset, width: 110, height: 32, type: 'page', siloColor: siloColors[i % siloColors.length] });
      });
    });

    return positions;
  }, [project, silos, pages]);

  // Sync computed layout into state (allows manual drag to override)
  useEffect(() => {
    setNodePositions(computedLayout);
  }, [computedLayout]);

  const autoLayout = useCallback(() => {
    setNodePositions(computedLayout);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [computedLayout]);

  // Health results
  const healthResults = useMemo(() =>
    silos.map(silo => calculateSiloHealth(silo, pages, internalLinks.map(l => ({
      fromPageId: l.fromPageId, toPageId: l.toPageId, anchor: l.anchor,
    })))),
    [silos, pages, internalLinks]
  );

  // Cannibalization
  const cannibalizationMap = useMemo(() => {
    const map: Record<string, Array<{ keyword: string; pages: Array<{ id: string; title: string }> }>> = {};
    for (const silo of silos) {
      map[silo.id] = detectCannibalization(pages, silo.id);
    }
    return map;
  }, [silos, pages]);

  // Get node position helper (memoized)
  const getNode = useCallback((id: string) => nodePositions.find(n => n.id === id), [nodePositions]);

  // Draw connections between nodes
  const connections = useMemo(() => {
    const lines: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string; type: 'project-silo' | 'silo-page' | 'page-page' | 'bleed' }> = [];

    if (!project) return lines;

    const getNodePos = (id: string) => nodePositions.find(n => n.id === id);

    // Project → Silo connections
    const projNode = getNodePos(project.id);
    silos.forEach((silo, i) => {
      const siloNode = getNodePos(silo.id);
      if (projNode && siloNode) {
        lines.push({
          from: { x: projNode.x + projNode.width / 2, y: projNode.y + projNode.height },
          to: { x: siloNode.x + siloNode.width / 2, y: siloNode.y },
          color: siloColors[i % siloColors.length],
          type: 'project-silo',
        });
      }

      const pillar = pages.find(p => p.siloId === silo.id && p.type === 'pillar');
      const siloPages = pages.filter(p => p.siloId === silo.id);

      siloPages.forEach(page => {
        const pageNode = getNodePos(page.id);
        if (siloNode && pageNode) {
          if (page.type === 'pillar') {
            lines.push({
              from: { x: siloNode.x + siloNode.width / 2, y: siloNode.y + siloNode.height },
              to: { x: pageNode.x + pageNode.width / 2, y: pageNode.y },
              color: siloColors[i % siloColors.length],
              type: 'silo-page',
            });
          } else if (pillar) {
            const pillarNode = getNodePos(pillar.id);
            if (pillarNode) {
              lines.push({
                from: { x: pillarNode.x + pillarNode.width / 2, y: pillarNode.y + pillarNode.height },
                to: { x: pageNode.x + pageNode.width / 2, y: pageNode.y },
                color: siloColors[i % siloColors.length] + '80',
                type: 'page-page',
              });
            }
          }
        }
      });
    });

    // Internal links (cross-silo = bleed)
    internalLinks.forEach(link => {
      const fromNode = getNodePos(link.fromPageId);
      const toNode = getNodePos(link.toPageId);
      const fromPage = pages.find(p => p.id === link.fromPageId);
      const toPage = pages.find(p => p.id === link.toPageId);
      if (fromNode && toNode && fromPage && toPage) {
        const isBleed = fromPage.siloId !== toPage.siloId;
        lines.push({
          from: { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
          to: { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 },
          color: isBleed ? '#ef4444' : '#6366f180',
          type: isBleed ? 'bleed' : 'page-page',
        });
      }
    });

    return lines;
  }, [nodePositions, project, silos, pages, internalLinks]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !dragNode) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (dragNode) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - pan.x - dragOffset.x) / zoom;
        const y = (e.clientY - rect.top - pan.y - dragOffset.y) / zoom;
        setNodePositions(prev => prev.map(n =>
          n.id === dragNode ? { ...n, x, y } : n
        ));
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDragNode(null);
  };

  // Node drag
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = getNode(nodeId);
    if (node) {
      setDragNode(nodeId);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: (e.clientX - rect.left - pan.x) / zoom - node.x,
          y: (e.clientY - rect.top - pan.y) / zoom - node.y,
        });
      }
    }
  };

  // Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.2, Math.min(3, prev * delta)));
  };

  // Reset view
  const resetView = () => {
    autoLayout();
  };

  if (!project) return null;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Network size={20} className="text-blue-400" />
          Mind Map
        </h2>
        <p className="text-slate-400 text-xs">Interactive silo architecture map. Drag nodes to rearrange. Scroll to zoom. Click and drag background to pan.</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white"><ZoomIn size={14} /></button>
        <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white"><ZoomOut size={14} /></button>
        <button onClick={resetView} className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white"><Maximize2 size={14} /></button>
        <span className="text-slate-500 text-[10px]">{Math.round(zoom * 100)}%</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowCannibalization(!showCannibalization)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium ${
            showCannibalization ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          <AlertTriangle size={10} />
          Cannibalization
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ height: '560px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
            </marker>
            <marker id="arrowhead-bleed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
            </marker>
          </defs>

          {/* Connections */}
          {connections.map((conn, i) => (
            <line
              key={i}
              x1={conn.from.x}
              y1={conn.from.y}
              x2={conn.to.x}
              y2={conn.to.y}
              stroke={conn.color}
              strokeWidth={conn.type === 'project-silo' ? 2.5 : conn.type === 'bleed' ? 2 : 1}
              strokeDasharray={conn.type === 'bleed' ? '6,3' : conn.type === 'page-page' ? '3,3' : 'none'}
              markerEnd={conn.type === 'page-page' || conn.type === 'bleed' ? `url(#arrowhead${conn.type === 'bleed' ? '-bleed' : ''})` : undefined}
              opacity={0.7}
            />
          ))}

          {/* Nodes */}
          {nodePositions.map(node => {
            const silo = silos.find(s => s.id === node.id);
            const page = pages.find(p => p.id === node.id);
            const health = silo ? healthResults.find(h => h.siloId === silo.id) : null;
            const cannibalization = silo ? cannibalizationMap[silo.id] : [];
            const isSelected = selectedNode === node.id;

            if (node.type === 'project') {
              return (
                <g key={node.id} onMouseDown={(e) => handleNodeMouseDown(e, node.id)} style={{ cursor: 'grab' }}>
                  <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={12}
                    fill="#1e293b" stroke="#3b82f6" strokeWidth={isSelected ? 3 : 2} />
                  <text x={node.x + node.width / 2} y={node.y + node.height / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize="13" fontWeight="bold">
                    {project?.name || 'Project'}
                  </text>
                </g>
              );
            }

            if (node.type === 'silo' && silo) {
              const hasCannibalization = cannibalization.length > 0;
              return (
                <g key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : node.id); }}
                  style={{ cursor: 'grab' }}
                >
                  <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={10}
                    fill="#1e293b" stroke={node.siloColor || '#3b82f6'} strokeWidth={isSelected ? 3 : 2} />
                  {/* Health dot */}
                  {health && (
                    <circle cx={node.x + 12} cy={node.y + node.height / 2} r={5}
                      fill={health.grade === 'healthy' ? '#10b981' : health.grade === 'warning' ? '#eab308' : '#ef4444'} />
                  )}
                  <text x={node.x + 24} y={node.y + node.height / 2 - 5}
                    textAnchor="start" dominantBaseline="middle"
                    fill="white" fontSize="11" fontWeight="600">
                    {silo.name}
                  </text>
                  <text x={node.x + 24} y={node.y + node.height / 2 + 10}
                    textAnchor="start" dominantBaseline="middle"
                    fill="#94a3b8" fontSize="9">
                    {pages.filter(p => p.siloId === silo.id).length} pages
                    {health ? ` · ${health.score}/100` : ''}
                  </text>
                  {/* Cannibalization badge */}
                  {showCannibalization && hasCannibalization && (
                    <circle cx={node.x + node.width - 8} cy={node.y + 8} r={6}
                      fill="#f97316" />
                  )}
                </g>
              );
            }

            if (node.type === 'page' && page) {
              return (
                <g key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : node.id); }}
                  style={{ cursor: 'grab' }}
                >
                  <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={6}
                    fill={page.type === 'pillar' ? '#1e3a5f' : page.type === 'cluster' ? '#2d1b69' : '#1c1917'}
                    stroke={node.siloColor || '#475569'}
                    strokeWidth={page.type === 'pillar' ? 2 : 1} />
                  {/* Type indicator */}
                  <rect x={node.x + 3} y={node.y + 3} width={4} height={node.height - 6} rx={2}
                    fill={page.type === 'pillar' ? '#3b82f6' : page.type === 'cluster' ? '#8b5cf6' : '#f97316'} />
                  <text x={node.x + 14} y={node.y + node.height / 2}
                    textAnchor="start" dominantBaseline="middle"
                    fill="#e2e8f0" fontSize="9" fontWeight="500">
                    {page.title.length > 18 ? page.title.slice(0, 18) + '…' : page.title}
                  </text>
                  {/* Content indicator */}
                  {page.content && page.content.length > 50 && (
                    <circle cx={node.x + node.width - 8} cy={node.y + 8} r={3} fill="#10b981" />
                  )}
                </g>
              );
            }

            return null;
          })}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 text-[10px]">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3 h-1.5 rounded bg-blue-500" /> <span className="text-slate-400">Pillar</span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3 h-1.5 rounded bg-purple-500" /> <span className="text-slate-400">Cluster</span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3 h-1.5 rounded bg-orange-500" /> <span className="text-slate-400">Blog</span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3 h-0.5 rounded bg-red-500" style={{ borderTop: '2px dashed #ef4444' }} /> <span className="text-slate-400">Bleed Link</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" /> <span className="text-slate-400">Has Content</span>
          </div>
        </div>

        {/* Selected Node Info */}
        {selectedNode && (() => {
          const silo = silos.find(s => s.id === selectedNode);
          const page = pages.find(p => p.id === selectedNode);
          if (silo) {
            const health = healthResults.find(h => h.siloId === silo.id);
            return (
              <div className="absolute top-3 right-3 w-64 bg-slate-800 border border-slate-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-white font-semibold text-xs">{silo.name}</h4>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white"><XCircle size={14} /></button>
                </div>
                {health && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${getHealthDot(health.grade)}`} />
                      <span className={`text-xs font-bold ${getHealthColor(health.grade)}`}>{health.score}/100</span>
                    </div>
                    {health.issues.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {health.issues.slice(0, 3).map((issue, i) => (
                          <div key={i} className="text-[10px] text-red-300 flex items-start gap-1">
                            <AlertTriangle size={8} className="mt-0.5 flex-shrink-0" /> {issue}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div className="text-slate-400 text-[10px]">{pages.filter(p => p.siloId === silo.id).length} pages</div>
              </div>
            );
          }
          if (page) {
            return (
              <div className="absolute top-3 right-3 w-64 bg-slate-800 border border-slate-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-white font-semibold text-xs">{page.title}</h4>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white"><XCircle size={14} /></button>
                </div>
                <PageTypeBadge type={page.type} size="sm" />
                <div className="text-slate-400 text-[10px] mt-2">/{page.slug}</div>
                {page.wordCount ? <div className="text-slate-400 text-[10px]">{page.wordCount.toLocaleString()} words</div> : null}
                <div className="text-slate-400 text-[10px]">{page.keywords.length} keywords</div>
                {page.content && page.content.length > 50 && (
                  <div className="flex items-center gap-1 mt-1 text-emerald-300 text-[10px]">
                    <CheckCircle2 size={10} /> Content generated
                  </div>
                )}
              </div>
            );
          }
          return null;
        })()}
      </div>
    </div>
  );
}

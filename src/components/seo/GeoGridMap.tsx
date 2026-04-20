'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';

interface GeoGridMapProps {
  centerLat: number;
  centerLng: number;
  nodes: Array<{
    lat: number;
    lng: number;
    row_idx: number;
    col_idx: number;
    rank: number | null;
    business_name: string | null;
    competitors: string | null;
  }>;
  showCompetitors: boolean;
  getRankColor: (rank: number | null) => string;
  viewMode?: 'heatmap' | 'markers' | 'both';
}

/**
 * Compute heatmap intensity from rank.
 * Rank 1 = 1.0 (max), scales down linearly.
 * null rank = 0 intensity.
 */
function getHeatIntensity(rank: number | null): number {
  if (rank === null) return 0;
  if (rank <= 1) return 1.0;
  if (rank >= 20) return 0.05;
  return 1.0 - (rank - 1) / 19;
}

/**
 * Compute heatmap circle radius in meters from rank.
 * Better ranks get larger circles for more visual emphasis.
 */
function getHeatRadius(rank: number | null, baseRadiusMeters: number): number {
  if (rank === null) return baseRadiusMeters * 0.6;
  if (rank <= 3) return baseRadiusMeters * 1.3;
  if (rank <= 10) return baseRadiusMeters * 1.0;
  return baseRadiusMeters * 0.8;
}

/**
 * Get marker size category based on rank.
 */
function getMarkerSize(rank: number | null): { width: number; height: number; fontSize: number } {
  if (rank === null) return { width: 22, height: 22, fontSize: 9 };
  if (rank <= 3) return { width: 34, height: 34, fontSize: 13 };
  if (rank <= 10) return { width: 26, height: 26, fontSize: 11 };
  return { width: 20, height: 20, fontSize: 9 };
}

export default function GeoGridMap({
  centerLat,
  centerLng,
  nodes,
  showCompetitors,
  getRankColor,
  viewMode = 'both',
}: GeoGridMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [currentView, setCurrentView] = useState<'heatmap' | 'markers' | 'both'>(viewMode);

  // Keep currentView in sync with prop changes
  useEffect(() => {
    setCurrentView(viewMode);
  }, [viewMode]);

  // Stable reference for getRankColor to avoid unnecessary map rebuilds
  const getRankColorRef = useRef(getRankColor);
  getRankColorRef.current = getRankColor;

  /**
   * Build the full map — called on mount and whenever nodes/currentView change.
   * Destroys any existing map first to avoid stale layers.
   */
  const buildMap = useCallback(() => {
    if (!mapRef.current) return;

    // Destroy previous instance if it exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([centerLat, centerLng], 13);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // --- Business center marker ---
    const businessIcon = L.divIcon({
      html: `<div style="
        background: #3b82f6;
        width: 24px; height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px rgba(59,130,246,0.4);
        display: flex; align-items: center; justify-content: center;
      "><svg width="12" height="12" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([centerLat, centerLng], { icon: businessIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup('<b style="font-size:13px">Your Business</b><br/><span style="color:#64748b;font-size:11px">Scan center</span>');

    // --- Estimate base radius in meters from node spacing ---
    let baseRadiusMeters = 200; // fallback
    if (nodes.length >= 2) {
      const n0 = nodes[0];
      const n1 = nodes[1];
      const dist = map.distance([n0.lat, n0.lng], [n1.lat, n1.lng]);
      baseRadiusMeters = Math.max(dist * 0.6, 100);
    }

    const showHeatmap = currentView === 'heatmap' || currentView === 'both';
    const showMarkers = currentView === 'markers' || currentView === 'both';

    // --- Heatmap layer: large semi-transparent circles ---
    if (showHeatmap && nodes.length > 0) {
      // Create a feature group for heatmap circles so we can manage them
      const heatGroup = L.featureGroup();

      for (const node of nodes) {
        const color = getRankColorRef.current(node.rank);
        const intensity = getHeatIntensity(node.rank);
        const radius = getHeatRadius(node.rank, baseRadiusMeters);

        // Parse hex color to RGB for rgba usage
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        // Inner glow circle (smaller, more opaque)
        L.circle([node.lat, node.lng], {
          radius: radius * 0.5,
          fillColor: `rgba(${r},${g},${b},${0.2 + intensity * 0.35})`,
          color: 'transparent',
          weight: 0,
          fillOpacity: 0.2 + intensity * 0.35,
          interactive: false,
        }).addTo(heatGroup);

        // Outer glow circle (larger, more transparent)
        L.circle([node.lat, node.lng], {
          radius: radius,
          fillColor: `rgba(${r},${g},${b},${0.08 + intensity * 0.15})`,
          color: 'transparent',
          weight: 0,
          fillOpacity: 0.08 + intensity * 0.15,
          interactive: false,
        }).addTo(heatGroup);
      }

      heatGroup.addTo(map);
    }

    // --- Rank markers with divIcon ---
    if (showMarkers && nodes.length > 0) {
      for (const node of nodes) {
        const color = getRankColorRef.current(node.rank);
        const size = getMarkerSize(node.rank);
        const rankText = node.rank !== null ? `#${node.rank}` : '?';

        const markerIcon = L.divIcon({
          html: `<div style="
            background: ${color};
            width: ${size.width}px;
            height: ${size.height}px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.9);
            box-shadow: 0 2px 6px rgba(0,0,0,0.4), 0 0 0 1px ${color}44;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: ${size.fontSize}px;
            font-weight: 700;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            line-height: 1;
            pointer-events: auto;
            cursor: pointer;
            transition: transform 0.15s ease;
          " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">${rankText}</div>`,
          className: '',
          iconSize: [size.width, size.height],
          iconAnchor: [size.width / 2, size.height / 2],
        });

        const marker = L.marker([node.lat, node.lng], {
          icon: markerIcon,
          zIndexOffset: node.rank !== null ? 500 - node.rank : 0,
        }).addTo(map);

        // --- Enhanced popup ---
        let popupContent = `<div style="min-width:160px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">`;

        // Rank badge
        popupContent += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">`;
        popupContent += `<span style="
          background:${color};
          color:white;
          padding:2px 8px;
          border-radius:12px;
          font-size:13px;
          font-weight:700;
        ">${node.rank !== null ? `Rank #${node.rank}` : 'Not Found'}</span>`;
        popupContent += `</div>`;

        // Grid position
        popupContent += `<div style="color:#94a3b8;font-size:11px;margin-bottom:4px;">`;
        popupContent += `Grid Position: Row ${node.row_idx + 1}, Col ${node.col_idx + 1}`;
        popupContent += `</div>`;

        // Coordinates
        popupContent += `<div style="color:#64748b;font-size:10px;margin-bottom:4px;">`;
        popupContent += `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}`;
        popupContent += `</div>`;

        // Business name
        if (node.business_name) {
          popupContent += `<div style="color:#cbd5e1;font-size:11px;margin-top:4px;">`;
          popupContent += `<b>Business:</b> ${node.business_name}`;
          popupContent += `</div>`;
        }

        // Competitors
        if (showCompetitors && node.competitors) {
          try {
            const competitors = JSON.parse(node.competitors);
            if (Array.isArray(competitors) && competitors.length > 0) {
              popupContent += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #334155;">`;
              popupContent += `<b style="font-size:11px;color:#94a3b8;">Top Competitors:</b>`;
              for (const c of competitors.slice(0, 5)) {
                const isHighlight = node.business_name && c.name === node.business_name;
                popupContent += `<div style="font-size:11px;padding:1px 0;${isHighlight ? 'color:#22c55e;font-weight:600;' : 'color:#cbd5e1;'}">`;
                popupContent += `${c.position}. ${c.name}`;
                popupContent += `</div>`;
              }
              popupContent += `</div>`;
            }
          } catch {}
        }

        popupContent += `</div>`;
        marker.bindPopup(popupContent, {
          maxWidth: 250,
          className: 'geogrid-popup',
        });
      }
    }

    // --- Fit bounds ---
    if (nodes.length > 0) {
      const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    // --- Legend overlay ---
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', '');
      div.innerHTML = `
        <div style="
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(71, 85, 105, 0.5);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #e2e8f0;
          font-size: 11px;
          line-height: 1.6;
          min-width: 140px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#f1f5f9;">Rank Legend</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block;box-shadow:0 0 4px #22c55e66;"></span>
            <span>Rank 1-3 (Top)</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="width:10px;height:10px;border-radius:50%;background:#eab308;display:inline-block;box-shadow:0 0 4px #eab30866;"></span>
            <span>Rank 4-10</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block;box-shadow:0 0 4px #ef444466;"></span>
            <span>Rank 11-20</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:10px;height:10px;border-radius:50%;background:#6b7280;display:inline-block;box-shadow:0 0 4px #6b728066;"></span>
            <span>Not Found</span>
          </div>
        </div>
      `;
      return div;
    };
    legend.addTo(map);

    // --- View mode toggle overlay ---
    const viewToggle = L.control({ position: 'topright' });
    viewToggle.onAdd = () => {
      const div = L.DomUtil.create('div', '');
      div.innerHTML = `
        <div style="
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(71, 85, 105, 0.5);
          border-radius: 8px;
          padding: 4px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          gap: 2px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          <button data-mode="heatmap" title="Heatmap only" style="
            background: ${currentView === 'heatmap' ? '#3b82f6' : 'transparent'};
            color: ${currentView === 'heatmap' ? 'white' : '#94a3b8'};
            border: none;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.15s;
          ">Heat</button>
          <button data-mode="markers" title="Markers only" style="
            background: ${currentView === 'markers' ? '#3b82f6' : 'transparent'};
            color: ${currentView === 'markers' ? 'white' : '#94a3b8'};
            border: none;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.15s;
          ">Markers</button>
          <button data-mode="both" title="Heatmap + Markers" style="
            background: ${currentView === 'both' ? '#3b82f6' : 'transparent'};
            color: ${currentView === 'both' ? 'white' : '#94a3b8'};
            border: none;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.15s;
          ">Both</button>
        </div>
      `;

      // Handle button clicks — prevent map interaction
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      div.querySelectorAll('button[data-mode]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const mode = (btn as HTMLButtonElement).getAttribute('data-mode') as 'heatmap' | 'markers' | 'both';
          if (mode && mode !== currentView) {
            setCurrentView(mode);
          }
        });
      });

      return div;
    };
    viewToggle.addTo(map);

    // Force a size invalidation after a tick (fixes tiles not loading in some containers)
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [centerLat, centerLng, nodes, showCompetitors, currentView]);

  // Build / rebuild map when dependencies change
  useEffect(() => {
    buildMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [buildMap]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <style>{`
        .geogrid-popup .leaflet-popup-content-wrapper {
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(71, 85, 105, 0.5);
          border-radius: 10px;
          color: #e2e8f0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .geogrid-popup .leaflet-popup-tip {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(71, 85, 105, 0.5);
        }
        .geogrid-popup .leaflet-popup-content {
          margin: 10px 14px;
        }
        .geogrid-popup .leaflet-popup-close-button {
          color: #94a3b8 !important;
        }
        .geogrid-popup .leaflet-popup-close-button:hover {
          color: #f1f5f9 !important;
        }
      `}</style>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

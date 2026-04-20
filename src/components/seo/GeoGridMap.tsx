'use client';

import { useEffect, useRef } from 'react';
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
}

export default function GeoGridMap({ centerLat, centerLng, nodes, showCompetitors, getRankColor }: GeoGridMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([centerLat, centerLng], 13);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Add business marker at center
    const businessIcon = L.divIcon({
      html: `<div style="background: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
      className: '',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker([centerLat, centerLng], { icon: businessIcon }).addTo(map).bindPopup('<b>Your Business</b>');

    // Add grid node markers
    for (const node of nodes) {
      const color = getRankColor(node.rank);
      const radius = node.rank && node.rank <= 3 ? 12 : node.rank && node.rank <= 10 ? 9 : 7;

      const marker = L.circleMarker([node.lat, node.lng], {
        radius, fillColor: color, color: '#1e293b', weight: 1, opacity: 1, fillOpacity: 0.8,
      }).addTo(map);

      let popupContent = `<div style="min-width:120px"><b>Rank: ${node.rank || 'Not Found'}</b><br/>`;
      popupContent += `<span style="color:#94a3b8;font-size:11px">Row ${node.row_idx}, Col ${node.col_idx}</span>`;

      if (showCompetitors && node.competitors) {
        try {
          const competitors = JSON.parse(node.competitors);
          if (Array.isArray(competitors) && competitors.length > 0) {
            popupContent += `<br/><br/><b style="font-size:11px">Top Competitors:</b>`;
            for (const c of competitors.slice(0, 3)) {
              popupContent += `<br/><span style="font-size:11px">${c.position}. ${c.name}</span>`;
            }
          }
        } catch {}
      }
      popupContent += '</div>';
      marker.bindPopup(popupContent);
    }

    // Fit bounds to all nodes
    if (nodes.length > 0) {
      const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [centerLat, centerLng, nodes, showCompetitors, getRankColor]);

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />;
}

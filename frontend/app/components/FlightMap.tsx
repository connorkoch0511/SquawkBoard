"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Flight } from "@/app/types/flight";

interface Props {
  flights: Flight[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const STATUS_COLOR: Record<string, string> = {
  "En Route": "#22d3ee",
  Climbing: "#4ade80",
  Descending: "#f97316",
  "On Ground": "#94a3b8",
};

function planeIcon(heading: number, status: string, selected: boolean): L.DivIcon {
  const color = selected ? "#fbbf24" : STATUS_COLOR[status] ?? "#22d3ee";
  const size = selected ? 22 : 16;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
         style="transform:rotate(${heading}deg);display:block;">
      <path fill="${color}" stroke="${selected ? "#000" : "none"}" stroke-width="0.5"
        d="M12 2L8 10H4l2 2-2 6 8-3 8 3-2-6 2-2h-4z"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function FlightMap({ flights, selectedId, onSelect }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [39.5, -98.35],
      zoom: 4,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://carto.com/">CARTO</a> | <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
        subdomains: "abcd",
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    map.on("click", () => onSelect(null));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers on every flight update
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const flight of flights) {
      seen.add(flight.id);
      const existing = markersRef.current.get(flight.id);
      const icon = planeIcon(flight.heading, flight.status, flight.id === selectedId);

      if (existing) {
        existing.setLatLng([flight.lat, flight.lng]);
        existing.setIcon(icon);
        existing.setTooltipContent(tooltipContent(flight));
      } else {
        const marker = L.marker([flight.lat, flight.lng], { icon })
          .bindTooltip(tooltipContent(flight), {
            permanent: false,
            direction: "top",
            offset: [0, -8],
            className: "squawk-tooltip",
          })
          .addTo(map);

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelect(flight.id);
        });

        markersRef.current.set(flight.id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [flights, selectedId, onSelect]);

  return (
    <>
      <style>{`
        .squawk-tooltip {
          background: rgba(15,23,42,0.92);
          border: 1px solid rgba(34,211,238,0.4);
          border-radius: 4px;
          color: #e2e8f0;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 11px;
          padding: 6px 8px;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,0.6);
        }
        .squawk-tooltip::before { display: none; }
        .leaflet-attribution-flag { display: none !important; }
        .leaflet-control-attribution {
          background: rgba(15,23,42,0.7) !important;
          color: #64748b !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: #94a3b8 !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}

function tooltipContent(f: Flight): string {
  return `
    <div style="line-height:1.6">
      <strong style="color:#22d3ee">${f.callsign}</strong><br/>
      ${f.origin} → ${f.destination}<br/>
      ALT ${f.altitude.toLocaleString()} ft · ${f.speed} kts
    </div>
  `;
}

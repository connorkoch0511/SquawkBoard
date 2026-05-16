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

const TRAIL_LENGTH = 16;
const TRAIL_STEP_SECS = 60; // seconds between synthetic history points

interface FlightLayer {
  marker: L.Marker;
  trails: L.Polyline[];
  history: L.LatLngTuple[];
  tickCount: number;
}

// Back-extrapolate TRAIL_LENGTH positions from the current fix using dead-reckoning.
// Each step goes back TRAIL_STEP_SECS seconds, giving ~16 min of visible trail on load.
function syntheticHistory(flight: Flight): L.LatLngTuple[] {
  const reverseHeadRad = ((flight.heading + 180) % 360) * (Math.PI / 180);
  // 1 knot = 1 nm/hr = 1/60 deg-lat/hr → per second = speed / 3600 / 60
  const degPerSec = flight.speed / 3600 / 60;
  const cosLat = Math.cos((flight.lat * Math.PI) / 180);
  const pts: L.LatLngTuple[] = [];

  for (let i = TRAIL_LENGTH; i >= 0; i--) {
    const secsBack = i * TRAIL_STEP_SECS;
    pts.push([
      flight.lat + Math.cos(reverseHeadRad) * degPerSec * secsBack,
      flight.lng + (Math.sin(reverseHeadRad) * degPerSec * secsBack) / cosLat,
    ]);
  }
  return pts;
}

export default function FlightMap({ flights, selectedId, onSelect }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, FlightLayer>>(new Map());
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
      for (const layer of layersRef.current.values()) {
        layer.trails.forEach((p) => p.remove());
      }
      layersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers and trails on every flight update
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const flight of flights) {
      seen.add(flight.id);
      const pos: L.LatLngTuple = [flight.lat, flight.lng];
      const icon = planeIcon(flight.heading, flight.status, flight.id === selectedId);
      const color = STATUS_COLOR[flight.status] ?? "#22d3ee";

      const existing = layersRef.current.get(flight.id);

      if (existing) {
        existing.tickCount++;

        // Advance trail once per minute so each segment is ~1 degree visible at zoom 4
        if (existing.tickCount % TRAIL_STEP_SECS === 0) {
          existing.history.push(pos);
          if (existing.history.length > TRAIL_LENGTH + 1) existing.history.shift();
          existing.trails.forEach((p) => p.remove());
          existing.trails = buildTrail(existing.history, color, map);
        }

        existing.marker.setLatLng(pos);
        existing.marker.setIcon(icon);
        existing.marker.setTooltipContent(tooltipContent(flight));
      } else {
        const history = syntheticHistory(flight);
        const marker = L.marker(pos, { icon })
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

        layersRef.current.set(flight.id, {
          marker,
          trails: buildTrail(history, color, map),
          history,
          tickCount: 0,
        });
      }
    }

    // Remove stale layers
    for (const [id, layer] of layersRef.current) {
      if (!seen.has(id)) {
        layer.marker.remove();
        layer.trails.forEach((p) => p.remove());
        layersRef.current.delete(id);
      }
    }
  }, [flights, selectedId, onSelect]);

  // Rebuild trails when selection changes (color update)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, layer] of layersRef.current) {
      const flight = flights.find((f) => f.id === id);
      if (!flight) continue;
      const color = STATUS_COLOR[flight.status] ?? "#22d3ee";
      layer.trails.forEach((p) => p.remove());
      layer.trails = buildTrail(layer.history, color, map);
      layer.marker.setIcon(planeIcon(flight.heading, flight.status, id === selectedId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

function buildTrail(history: L.LatLngTuple[], color: string, map: L.Map): L.Polyline[] {
  if (history.length < 2) return [];
  const lines: L.Polyline[] = [];
  for (let i = 1; i < history.length; i++) {
    // opacity: 0.05 at oldest end → 0.55 at newest end
    const opacity = 0.05 + (i / (history.length - 1)) * 0.5;
    const line = L.polyline([history[i - 1], history[i]], {
      color,
      weight: 2,
      opacity,
      smoothFactor: 1,
    }).addTo(map);
    lines.push(line);
  }
  return lines;
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

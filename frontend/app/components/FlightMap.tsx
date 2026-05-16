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

// Trail is only drawn for the selected flight to keep the map clean.
const TRAIL_POINTS = 14;       // number of history points to draw
const TRAIL_STEP_SECS = 30;    // seconds between each history point

interface FlightLayer {
  marker: L.Marker;
  trail: L.Polyline | null;    // single multi-point polyline, null when unselected
  history: L.LatLngTuple[];    // accumulated positions, updated every TRAIL_STEP_SECS ticks
  tickCount: number;
}

// Back-extrapolate TRAIL_POINTS positions using dead-reckoning so the trail
// appears immediately when a flight is selected (no wait for history to build).
function syntheticHistory(flight: Flight): L.LatLngTuple[] {
  const revRad = ((flight.heading + 180) % 360) * (Math.PI / 180);
  // 1 knot = 1 nm/hr = 1/60 deg/hr → deg/sec = speed / (60 * 3600)
  const degPerSec = flight.speed / (60 * 3600);
  const cosLat = Math.cos((flight.lat * Math.PI) / 180) || 0.001;
  const pts: L.LatLngTuple[] = [];
  for (let i = TRAIL_POINTS; i >= 0; i--) {
    const s = i * TRAIL_STEP_SECS;
    pts.push([
      flight.lat + Math.cos(revRad) * degPerSec * s,
      flight.lng + (Math.sin(revRad) * degPerSec * s) / cosLat,
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
        layer.trail?.remove();
      }
      layersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers every tick; advance selected flight's trail every TRAIL_STEP_SECS ticks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const flight of flights) {
      seen.add(flight.id);
      const pos: L.LatLngTuple = [flight.lat, flight.lng];
      const isSelected = flight.id === selectedId;
      const icon = planeIcon(flight.heading, flight.status, isSelected);
      const color = STATUS_COLOR[flight.status] ?? "#22d3ee";
      const existing = layersRef.current.get(flight.id);

      if (existing) {
        existing.tickCount++;

        // Keep history growing for all flights so it's ready when selected
        if (existing.tickCount % TRAIL_STEP_SECS === 0) {
          existing.history.push(pos);
          if (existing.history.length > TRAIL_POINTS + 1) existing.history.shift();

          // Redraw trail only if this is the selected flight
          if (isSelected) {
            existing.trail?.remove();
            existing.trail = buildTrail(existing.history, color, map);
          }
        }

        existing.marker.setLatLng(pos);
        existing.marker.setIcon(icon);
        existing.marker.setTooltipContent(tooltipContent(flight));
      } else {
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
          trail: null,
          history: [pos],
          tickCount: 0,
        });
      }
    }

    // Remove stale layers
    for (const [id, layer] of layersRef.current) {
      if (!seen.has(id)) {
        layer.marker.remove();
        layer.trail?.remove();
        layersRef.current.delete(id);
      }
    }
  }, [flights, selectedId, onSelect]);

  // Draw/clear trail when selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const [id, layer] of layersRef.current) {
      const flight = flights.find((f) => f.id === id);
      if (!flight) continue;

      layer.marker.setIcon(planeIcon(flight.heading, flight.status, id === selectedId));

      if (id === selectedId) {
        // Use accumulated history, filled out with synthetic points if short
        const history =
          layer.history.length > 2
            ? layer.history
            : syntheticHistory(flight);
        layer.trail?.remove();
        layer.trail = buildTrail(history, STATUS_COLOR[flight.status] ?? "#22d3ee", map);
      } else {
        layer.trail?.remove();
        layer.trail = null;
      }
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

function buildTrail(history: L.LatLngTuple[], color: string, map: L.Map): L.Polyline | null {
  if (history.length < 2) return null;
  return L.polyline(history, {
    color,
    weight: 2.5,
    opacity: 0.7,
    smoothFactor: 1,
    dashArray: undefined,
  }).addTo(map);
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

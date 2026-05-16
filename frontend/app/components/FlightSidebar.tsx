"use client";

import { useState, useMemo } from "react";
import type { Flight, FlightStatus } from "@/app/types/flight";

interface Props {
  flights: Flight[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const STATUS_COLOR: Record<FlightStatus, string> = {
  "En Route": "bg-cyan-400",
  Climbing: "bg-green-400",
  Descending: "bg-orange-400",
  "On Ground": "bg-slate-400",
};

const STATUS_TEXT: Record<FlightStatus, string> = {
  "En Route": "text-cyan-400",
  Climbing: "text-green-400",
  Descending: "text-orange-400",
  "On Ground": "text-slate-400",
};

const ALL_STATUSES: FlightStatus[] = ["En Route", "Climbing", "Descending"];

export default function FlightSidebar({ flights, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<FlightStatus | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return flights.filter((f) => {
      const matchesQuery =
        !q ||
        f.callsign.toLowerCase().includes(q) ||
        f.airline.toLowerCase().includes(q) ||
        f.origin.toLowerCase().includes(q) ||
        f.destination.toLowerCase().includes(q);
      const matchesStatus = !activeStatus || f.status === activeStatus;
      return matchesQuery && matchesStatus;
    });
  }, [flights, query, activeStatus]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="absolute top-[44px] right-3 z-[1001] flex items-center gap-1.5 rounded-md border border-cyan-900/50 bg-slate-900/90 px-2.5 py-1.5 font-mono text-xs text-slate-300 backdrop-blur-sm hover:border-cyan-500/50 hover:text-cyan-400 transition-colors"
        aria-label="Toggle flight list"
      >
        <ListIcon />
        <span>{open ? "Hide" : "Flights"}</span>
      </button>

      {/* Sidebar panel */}
      <div
        className={`absolute top-[36px] right-0 bottom-0 z-[1000] flex flex-col w-72 border-l border-cyan-900/30 bg-slate-900/95 backdrop-blur-sm font-mono text-xs transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          {/* Search */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search callsign, airline, route…"
            className="w-full rounded bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-600 transition-colors"
          />

          {/* Status filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setActiveStatus(activeStatus === s ? null : s)}
                className={`rounded-full px-2 py-0.5 border transition-colors ${
                  activeStatus === s
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="text-slate-500">
            {filtered.length} of {flights.length} flights
          </div>
        </div>

        {/* Flight list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-slate-600 text-center">No flights match</div>
          ) : (
            filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelect(f.id === selectedId ? null : f.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-800/60 hover:bg-slate-800/60 transition-colors ${
                  f.id === selectedId ? "bg-cyan-900/30 border-l-2 border-l-cyan-500" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_COLOR[f.status]}`} />
                    <span className="text-cyan-400 font-bold">{f.callsign}</span>
                  </div>
                  <span className={`text-[10px] ${STATUS_TEXT[f.status]}`}>{f.status}</span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span>{f.origin} → {f.destination}</span>
                  <span className="text-slate-500">{f.altitude.toLocaleString()} ft</span>
                </div>

                <div className="text-slate-600 truncate mt-0.5">{f.airline}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function ListIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="0" y="2" width="16" height="2" rx="1" />
      <rect x="0" y="7" width="16" height="2" rx="1" />
      <rect x="0" y="12" width="16" height="2" rx="1" />
    </svg>
  );
}

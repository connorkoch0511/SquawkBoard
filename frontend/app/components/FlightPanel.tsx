"use client";

import type { Flight } from "@/app/types/flight";

interface Props {
  flight: Flight | null;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  "En Route": "text-cyan-400",
  Climbing: "text-green-400",
  Descending: "text-orange-400",
  "On Ground": "text-slate-400",
};

export default function FlightPanel({ flight, onClose }: Props) {
  if (!flight) return null;

  return (
    <div className="absolute bottom-4 left-4 z-[1000] w-72 rounded-lg border border-cyan-900/60 bg-slate-900/95 p-4 shadow-xl backdrop-blur-sm font-mono text-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-cyan-400 font-bold text-base tracking-widest">
          {flight.callsign}
        </span>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row label="SQUAWK" value={flight.squawk} />
        <Row label="STATUS" value={flight.status} valueClass={STATUS_COLOR[flight.status]} />
        <Row label="ORIGIN" value={flight.origin} />
        <Row label="DEST" value={flight.destination} />
        <Row label="ALTITUDE" value={`${flight.altitude.toLocaleString()} ft`} />
        <Row label="SPEED" value={`${flight.speed} kts`} />
        <Row label="HEADING" value={`${Math.round(flight.heading)}°`} />
        <Row label="PROGRESS" value={`${Math.round(flight.progress * 100)}%`} />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 text-slate-500 text-xs truncate">
        {flight.airline}
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1 w-full rounded-full bg-slate-800">
        <div
          className="h-1 rounded-full bg-cyan-500 transition-all duration-500"
          style={{ width: `${flight.progress * 100}%` }}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass = "text-slate-200",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </>
  );
}

"use client";

import type { Flight } from "@/app/types/flight";

interface Props {
  flights: Flight[];
  connected: boolean;
  lastUpdate: string | null;
}

export default function StatsBar({ flights, connected, lastUpdate }: Props) {
  const counts = flights.reduce(
    (acc, f) => {
      acc[f.status] = (acc[f.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const avgAlt =
    flights.length > 0
      ? Math.round(
          flights.reduce((s, f) => s + f.altitude, 0) / flights.length
        ).toLocaleString()
      : "—";

  const time = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";

  return (
    <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center gap-6 bg-slate-900/90 backdrop-blur-sm border-b border-cyan-900/40 px-4 py-2 font-mono text-xs">
      {/* Logo */}
      <span className="text-cyan-400 font-bold tracking-widest text-sm shrink-0">
        SQUAWKBOARD
      </span>

      {/* Connection status */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "bg-green-400 animate-pulse" : "bg-red-500"
          }`}
        />
        <span className={connected ? "text-green-400" : "text-red-400"}>
          {connected ? "LIVE" : "RECONNECTING"}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      <Stat label="FLIGHTS" value={String(flights.length)} color="text-cyan-400" />
      <Stat label="EN ROUTE" value={String(counts["En Route"] ?? 0)} color="text-cyan-300" />
      <Stat label="CLIMBING" value={String(counts["Climbing"] ?? 0)} color="text-green-400" />
      <Stat label="DESCENDING" value={String(counts["Descending"] ?? 0)} color="text-orange-400" />
      <Stat label="AVG ALT" value={`${avgAlt} ft`} color="text-slate-300" />

      <div className="ml-auto text-slate-500 shrink-0">UTC {time}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex gap-1.5 items-baseline shrink-0">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}

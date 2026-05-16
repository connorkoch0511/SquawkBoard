"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useFlights } from "@/app/hooks/useFlights";
import StatsBar from "@/app/components/StatsBar";
import FlightPanel from "@/app/components/FlightPanel";

// Leaflet requires the browser DOM — never SSR
const FlightMap = dynamic(() => import("@/app/components/FlightMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center text-slate-600 font-mono text-sm">
      Loading map…
    </div>
  ),
});

export default function Page() {
  const { flights, connected, lastUpdate } = useFlights();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedFlight = selectedId
    ? (flights.find((f) => f.id === selectedId) ?? null)
    : null;

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden">
      <StatsBar flights={flights} connected={connected} lastUpdate={lastUpdate} />

      {/* Map fills everything below the stats bar */}
      <div className="absolute inset-0 top-[36px]">
        <FlightMap
          flights={flights}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <FlightPanel
        flight={selectedFlight}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

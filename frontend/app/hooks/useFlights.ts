"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Flight, FlightUpdate } from "@/app/types/flight";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const RECONNECT_DELAY_MS = 3000;

export function useFlights() {
  const [flights, setFlights] = useState<Map<string, Flight>>(new Map());
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial snapshot so the map isn't empty on first render.
  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/flights`);
      const data = await res.json();
      setFlights(
        new Map<string, Flight>(
          (data.flights as Flight[]).map((f) => [f.id, f])
        )
      );
    } catch {
      // WebSocket will catch up shortly
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const update: FlightUpdate = JSON.parse(event.data);
        if (update.type === "update") {
          setFlights(
            new Map<string, Flight>(update.flights.map((f) => [f.id, f]))
          );
          setLastUpdate(update.time);
        }
      } catch {
        // malformed frame — ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    loadSnapshot();
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect, loadSnapshot]);

  return { flights: Array.from(flights.values()), connected, lastUpdate };
}

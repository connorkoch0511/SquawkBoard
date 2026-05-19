# SquawkBoard

Real-time flight tracking dashboard — 40 simulated flights broadcasting live position data over WebSocket. Built as a portfolio piece to demonstrate event-driven architecture and WebSocket-based UIs.

**Live demo:** https://squawk-board.vercel.app

---

## What it does

- Streams 40 simulated flights over WebSocket, updating every second
- Leaflet map with rotating plane icons and a flight trail on the selected aircraft
- Stats bar: total flights, en-route count, average altitude
- Sidebar: searchable, filterable flight list (callsign, airline, origin/destination, status)
- Detail panel: squawk code, altitude, speed, heading for the selected flight
- Falls back to a REST snapshot on load so the map is populated before the WebSocket connects

## Architecture

```
Browser ──WS──► Go backend ──pub/sub──► Redis
                    │
                    └──GET /api/flights (REST snapshot)
```

The backend runs a goroutine that ticks every second, interpolating each flight along a great-circle route between two US airports. Updates are broadcast to all connected clients via gorilla/websocket. Redis pub/sub is optional — the server degrades gracefully and runs without it.

**Backend** (`backend/`) — Go 1.26, gorilla/websocket, go-redis/v9, rs/cors  
**Frontend** (`frontend/`) — Next.js 15 App Router, Leaflet, Tailwind CSS  
**Deploy** — Backend on Render (free tier), frontend on Vercel

## Local development

**Prerequisites:** Go 1.26+, Node 20+, Docker (for Redis)

```bash
# Start Redis
docker compose up -d redis

# Backend (port 8080)
cd backend && go run ./cmd/server

# Frontend (port 3000)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. The frontend points to the Render backend by default — to use local backend, set `NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws` and `NEXT_PUBLIC_API_URL=http://localhost:8080` in `frontend/.env.local`.

## Running tests

E2E Playwright tests run against the live production URL:

```bash
cd frontend
npx playwright install chromium   # first time only
npx playwright test
```

Screenshots are saved to `frontend/tests/screenshots/`.

## Project structure

```
backend/
  cmd/server/        HTTP server, routes, startup
  internal/
    simulation/      Flight simulation (great-circle interpolation, 40 flights)
    hub/             WebSocket hub (broadcast, ping/pong keepalive)
    redis/           Redis pub/sub publisher and subscriber
frontend/
  app/
    components/      FlightMap, FlightSidebar, StatsBar, DetailPanel
    hooks/           useFlights (WebSocket + REST, auto-reconnect)
    types/           Flight type
Dockerfile           Multi-stage build for Render deployment
docker-compose.yml   Local Redis
```

## Related project

[FlightBench](https://github.com/connorkoch0511/FlightBench) — C++ flight simulation benchmarking suite. SquawkBoard is the live visualization counterpart.

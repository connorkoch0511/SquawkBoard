.PHONY: dev backend frontend redis

# Start everything for local development
dev:
	@echo "Starting Redis, backend, and frontend..."
	@make redis &
	@sleep 1
	@make backend &
	@make frontend

redis:
	docker compose up redis

backend:
	cd backend && go run ./cmd/server

frontend:
	cd frontend && npm run dev

build-backend:
	cd backend && go build -o bin/squawkboard ./cmd/server

test-backend:
	cd backend && go test ./...

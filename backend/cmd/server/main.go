package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/cors"

	"github.com/connorkoch0511/squawkboard/internal/hub"
	redispkg "github.com/connorkoch0511/squawkboard/internal/redis"
	"github.com/connorkoch0511/squawkboard/internal/simulation"
)

func main() {
	defaultAddr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		defaultAddr = ":" + port
	}
	addr := flag.String("addr", defaultAddr, "HTTP listen address")
	redisAddr := flag.String("redis", "localhost:6379", "Redis address (leave empty to disable)")
	flightCount := flag.Int("flights", 40, "Number of simulated flights")
	flag.Parse()

	h := hub.NewHub()
	go h.Run()

	sim := simulation.NewSimulator(*flightCount)
	updates := sim.Run()

	// Optionally wire Redis pub/sub
	var publisher *redispkg.Publisher
	useRedis := *redisAddr != ""
	if useRedis {
		var err error
		publisher, err = redispkg.NewPublisher(*redisAddr)
		if err != nil {
			log.Printf("redis unavailable (%v) — running without pub/sub", err)
			useRedis = false
		}
	}

	// Forward simulation updates → hub (and optionally → Redis)
	go func() {
		ctx := context.Background()
		for payload := range updates {
			h.Broadcast(payload)
			if useRedis && publisher != nil {
				if err := publisher.Publish(ctx, payload); err != nil {
					log.Printf("redis publish error: %v", err)
				}
			}
		}
	}()

	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", h.ServeWS)

	// REST: initial snapshot so the frontend doesn't wait for the first tick
	mux.HandleFunc("/api/flights", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		snapshot := sim.Snapshot()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"flights": snapshot,
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Health
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	handler := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	}).Handler(mux)

	srv := &http.Server{
		Addr:    *addr,
		Handler: handler,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("SquawkBoard backend listening on %s (flights: %d, redis: %v)", *addr, *flightCount, useRedis)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-quit
	log.Println("shutting down...")
	sim.Stop()
	if publisher != nil {
		publisher.Close()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

package redis

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

const channel = "squawkboard:flights"

// Publisher wraps a Redis client and publishes flight update payloads.
type Publisher struct {
	rdb *redis.Client
}

func NewPublisher(addr string) (*Publisher, error) {
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	log.Printf("redis connected at %s", addr)
	return &Publisher{rdb: rdb}, nil
}

func (p *Publisher) Publish(ctx context.Context, payload []byte) error {
	return p.rdb.Publish(ctx, channel, payload).Err()
}

func (p *Publisher) Close() {
	p.rdb.Close()
}

// Subscriber subscribes to the flights channel and forwards messages to the returned channel.
type Subscriber struct {
	rdb *redis.Client
	sub *redis.PubSub
}

func NewSubscriber(addr string) (*Subscriber, error) {
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	sub := rdb.Subscribe(ctx, channel)
	return &Subscriber{rdb: rdb, sub: sub}, nil
}

func (s *Subscriber) Messages() <-chan []byte {
	out := make(chan []byte, 64)
	go func() {
		defer close(out)
		ch := s.sub.Channel()
		for msg := range ch {
			out <- []byte(msg.Payload)
		}
	}()
	return out
}

func (s *Subscriber) Close() {
	s.sub.Close()
	s.rdb.Close()
}

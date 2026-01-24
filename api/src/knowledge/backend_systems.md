# Backend Systems: Scalable Architecture

## 1. Microservices vs Monolith
- **Start Monolithic**: Modular Monolith is best for < 100k users.
- **Split When Needed**: Extract services only when scaling team organization or specific resource contention (e.g., Video Processing service).

## 2. Database Design
- **PostgreSQL**: The default choice. JSONB columns allow flexibility like MongoDB.
- **Indexing**: Always index Foreign Keys + query filters. Use `EXPLAIN ANALYZE`.
- **Connection Pooling**: Use PgBouncer. Serverless functions exhaust connections instantly without it.

## 3. Caching Strategy (Redis)
- **Cache-Aside**: App checks Redis -> Miss -> Get DB -> Write Redis.
- **Write-Through**: Write to DB and Redis simultaneously (Harder consistency).
- **TTL**: Always set Time-To-Live. Old data is toxic.
- **Eviction**: LRU (Least Recently Used) policy for memory limits.

## 4. System Design Patterns
- **Message Queues**: RabbitMQ/Kafka for async processing (Emails, Reports). Decouple fast producers from slow consumers.
- **Idempotency**: Ensure retried API calls don't duplicate actions (e.g., payments). Use `Idempotency-Key` header + Redis lock.
- **Rate Limiting**: Token Bucket algorithm in Redis to prevent abuse.

## 5. API Excellence
- **REST**: Standard resource naming. `/users/123/orders`.
- **GraphQL**: For complex frontend data needs (prevent over-fetching).
- **gRPC**: For rapid internal service-to-service communication (Protobuf binary).

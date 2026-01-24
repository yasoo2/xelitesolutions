# Resilience & Disaster Recovery: Systems That Never Sleep

## 1. Fault Tolerance Patterns
- **Circuit Breaker**: Detect failures and "trip" the circuit to prevent cascading failures. Allow the system to recover gracefully (e.g., return cached data or a meaningful error).
- **Bulkheads**: Isolate resources (threads, connections) so a failure in one component doesn't take down the entire system.
- **Retry Strategy**: Use Exponential Backoff with Jitter to prevent "Thundering Herd" problems on downstream services.

## 2. High Availability (HA)
- **Multi-Region Active-Active**: Traffic is routed to the nearest healthy region (Global Server Load Balancing). Requires sophisticated DB replication (e.g., DynamoDB Global Tables).
- **Blue-Green Deployments**: Maintain two identical production environments. Switch traffic from Blue to Green after successful health checks.
- **Chaos Engineering**: Regularly inject failures into production (e.g., kill a random pod) to ensure the system is truly resilient.

## 3. Disaster Recovery (DR) Strategies
- **RTO (Recovery Time Objective)**: How quickly must we be back online?
- **RPO (Recovery Point Objective)**: How much data loss is acceptable?
- **Pilot Light**: Maintain a minimal version of the environment in another region; scale it up only during a disaster.

## 4. Database Replication
- **Synchronous**: Data written to both primary and replica before success. Zero data loss, higher latency.
- **Asynchronous**: Data written to primary, then replicated. Lower latency, risk of data loss during primary failure.
- **Quorum**: Requires a majority of nodes to agree on a write (Standard in distributed systems like Cassandra/MongoDB).

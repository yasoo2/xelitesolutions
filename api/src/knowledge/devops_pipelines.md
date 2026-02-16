# DevOps & Infrastructure: Automation

## 1. Docker Mastery
- **Multi-Stage Builds**:
  ```dockerfile
  # Builder
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY . .
  RUN npm ci && npm run build

  # Runner
  FROM node:20-alpine AS runner
  COPY --from=builder /app/.next ./.next
  CMD ["npm", "start"]
  ```
- **Optimization**: Order layers from least changed to most changed (package.json first) to maximize cache hits.

## 2. Kubernetes (K8s)
- **Deployment**: Defines replicas and update strategy (RollingUpdate).
- **Service**: Stable Network IP. Use `ClusterIP` for internal, `LoadBalancer` for external.
- **Ingress**: Nginx Controller to route `api.domain.com` vs `app.domain.com`.
- **HPA**: Horizontal Pod Autoscaler based on CPU/RAM metrics.

## 3. CI/CD Pipelines (GitHub Actions)
- **Lint & Test**: Run on every Pull Request. Block merge if failed.
- **Build & Push**: Build Docker image -> Push to ECR/GHCR.
- **Deploy**: Update K8s manifest (Helm upgrade) or trigger Vercel deployment.

## 4. Observability
- **Logs**: ELK Stack (Elasticsearch, Logstash, Kibana) or Loki/Grafana.
- **Metrics**: Prometheus (Pull model).
- **Tracing**: OpenTelemetry (Jaeger) to see a request flow through microservices.

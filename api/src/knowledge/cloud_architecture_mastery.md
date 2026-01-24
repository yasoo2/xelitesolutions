# Cloud Architecture Mastery: The Well-Architected Framework

## 1. AWS Well-Architected Pillars
- **Operational Excellence**: IaC (Infrastructure as Code) using Terraform/CDK. No manual clicks.
- **Security**: IAM Least Privilege. Zero Trust Network. encryption at rest (KMS) & transit (TLS).
- **Reliability**: Multi-AZ deployments. Auto-Scaling Groups (ASG). Self-healing systems.
- **Performance**: Caching (CloudFront/ElastiCache). Right-sizing instances.
- **Cost Optimization**: Spot Instances for stateless workloads. Auto-shutdown for dev envs.

## 2. Serverless Patterns
- **Event-Driven**: S3 Upload -> EventBridge -> Lambda -> DynamoDB. Decoupled and scalable.
- **Cold Starts**: Use lightweight runtimes (Rust/Go/Node.js) and Provisioned Concurrency for critical paths.
- **API Gateway**: Throttling, Validation, and Auth (Cognito) at the front door.

## 3. Azure Enterprise
- **Entra ID (Azure AD)**: The Gold Standard for corporate identity integration.
- **App Service**: PaaS for easy .NET/Node hosting without K8s complexity.
- **Hybrid Cloud**: Azure Arc to manage on-prem servers from the cloud portal.

## 4. Modern Data Architecture
- **Data Lake**: S3/Azure Blob for raw storage (Parquet format).
- **Data Warehouse**: Snowflake/Redshift for analytics (OLAP).
- **ETL/ELT**: Airflow or AWS Glue pipelines.

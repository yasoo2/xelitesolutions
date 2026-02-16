# Fintech & Banking Architecture: The Ledger of Truth

## 1. Data Integrity & Bookkeeping
- **Double-Entry Bookkeeping**: Every transaction must have at least one debit and one credit. Total balance must always be zero across the system. 
- **Immutable Ledgers**: Use append-only tables for transactions. Never `UPDATE` a balance directly; instead, `INSERT` a transaction and calculate balance via aggregate (or cached balance with audit trail).
- **ACID Compliance**: Strict adherence to Atomicity, Consistency, Isolation, and Durability is non-negotiable for financial state changes.

## 2. Distributed Transactions
- **The Saga Pattern**: Orchestrate multi-service transactions. Use "Compensating Transactions" to undo steps if a later step fails.
- **Idempotency**: Every payment request must have a unique `Idempotency-Key`. Retries from client should never result in double-charging.
- **Two-Phase Commit (2PC)**: Useful for strong consistency across shared databases, though less scalable than Sagay.

## 3. Compliance & Security
- **PCI-DSS**: Never store raw CVV or magnetic stripe data. Encrypt PAN (Primary Account Number) at rest using KMS.
- **KYC/AML**: Implement automated workflows for "Know Your Customer" and "Anti-Money Laundering" checks.
- **HSM (Hardware Security Modules)**: Use physical hardware for key management in high-security environments.

## 4. Payment Gateways
- **Webhooks**: Must be asynchronous. Acknowledge receipt (`200 OK`) immediately, then process in the background.
- **Batch Processing**: Handle bulk payouts or end-of-day reconciliations using distributed queues (Kafka/SQS).

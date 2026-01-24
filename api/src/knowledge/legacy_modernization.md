# Legacy Modernization: From Monolith to Masterpiece

## 1. Modernization Patterns
- **Strangler Fig Pattern**: Incrementally replace legacy functionality with new services. The legacy system eventually "withers" away.
- **Anti-Corruption Layer (ACL)**: Create a shim between new and old systems to prevent the legacy data model from polluting the new architecture.
- **Decomposition by Subdomain**: Use Domain-Driven Design (DDD) to find "Bounded Contexts" and extract services based on business value.

## 2. Technical Debt Remediation
- **Modular Monolith**: Before jumping to microservices, clean up the legacy codebase by enforcing strict module boundaries internally.
- **Testing the Untestable**: Use "Characterization Tests" to record current (even if buggy) behavior so you don't break side-effects during refactoring.
- **Shadow Reads**: Run the new service alongside the old one. Compare outputs but ignore the new service's result for production traffic until confidence is 100%.

## 3. Database Migration
- **Zero-Downtime Migration**:
    1. Implement dual-write to both legacy and new DBs.
    2. Backfill historical data (Batch).
    3. Verify and sync.
    4. Switch reads to new DB.
    5. Remove legacy writes.

## 4. Organizational Impact
- **Conway's Law**: Organizations design systems that mirror their communication structure. You cannot have microservices without cross-functional teams.
- **Buy-in**: modernization is a journey, not a project. Focus on business value in every extracted service.

# API Dependencies Documentation

## Critical Dependency Constraints

### apache-arrow Version Constraint

**Version**: `18.1.0` (pinned, no caret)

**Reason**: The `@lancedb/lancedb@0.26.2` package has a peer dependency requirement for `apache-arrow` that must be between versions `15.0.0` and `18.1.0` (inclusive). 

**Previous Issue**: The project previously had `apache-arrow@^21.1.0` which caused dependency conflicts during `npm install`, leading to:
- Postinstall script failures
- CI/CD pipeline failures  
- Deployment failures

**Resolution**: Downgraded to `apache-arrow@18.1.0` (the highest compatible version) and pinned without a caret (^) to prevent automatic upgrades that would break compatibility.

**Important**: Do not upgrade apache-arrow beyond version 18.1.0 unless @lancedb/lancedb is also upgraded to a version that supports newer apache-arrow versions.

### Upgrading LanceDB

If you need to upgrade `@lancedb/lancedb` in the future:
1. Check the peer dependency requirements for `apache-arrow` in the new version
2. Update `apache-arrow` to the highest compatible version
3. Test thoroughly before deploying

### Date of Last Update
- **Date**: 2026-02-13
- **Issue**: Dependency conflict preventing CI/CD and deployment
- **Fixed by**: Downgrading apache-arrow from 21.1.0 to 18.1.0

# Web Dependencies Documentation

## Critical Dependency Constraints

### ESLint Version Constraint

**Version**: `^9.0.0` (not 10.x)

**Reason**: The `@typescript-eslint/eslint-plugin@8.55.0` package has a peer dependency requirement for `eslint` that must be version `^8.57.0 || ^9.0.0`. 

**Previous Issue**: The project previously had `eslint@^10.0.0` which caused dependency conflicts during `npm install`, leading to:
- Postinstall script failures
- CI/CD pipeline failures  
- Deployment failures

**Resolution**: Downgraded to `eslint@^9.0.0` (the highest compatible version) to ensure compatibility with TypeScript ESLint tooling.

**Important**: Do not upgrade ESLint to version 10.x unless @typescript-eslint/eslint-plugin is also upgraded to a version that supports ESLint 10.

### TypeScript ESLint Tooling Synchronization

Both `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` should be kept at the same version to avoid compatibility issues.

**Current versions**:
- `@typescript-eslint/eslint-plugin`: `^8.55.0`
- `@typescript-eslint/parser`: `^8.55.0`
- `eslint`: `^9.0.0`

### Upgrading ESLint in the Future

When upgrading ESLint:
1. Check the peer dependency requirements for `eslint` in the current version of `@typescript-eslint/eslint-plugin`
2. Only upgrade ESLint to a version supported by the TypeScript ESLint packages
3. Keep `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` at the same version
4. Test linting functionality before deploying

### Date of Last Update
- **Date**: 2026-02-14
- **Issue**: ESLint 10.0.0 incompatibility with @typescript-eslint packages
- **Fixed by**: Downgrading ESLint from 10.0.0 to 9.0.0 and syncing parser version to 8.55.0

#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

chmod +x ./scripts/deploy.sh 2>/dev/null || true
exec bash ./scripts/deploy.sh

#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
git config core.hooksPath .githooks
echo "Git hooks installed (core.hooksPath=.githooks)"

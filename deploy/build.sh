#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm --prefix app/client ci --include=dev
npm --prefix spike ci --include=dev
npm --prefix app/client run build
npm --prefix spike run build

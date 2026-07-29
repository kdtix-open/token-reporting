#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NODE_BIN="${TOKEN_REPORTING_NODE_BIN:-$(command -v node)}"
TSX_CLI="${TOKEN_REPORTING_TSX_CLI:-${REPO_ROOT}/node_modules/tsx/dist/cli.mjs}"
PID_FILE="${TOKEN_REPORTING_PID_FILE:-${REPO_ROOT}/tmp/projectit-token-reporting-production.pid}"
BASE_PATH="${TOKEN_REPORTING_BASE_PATH:-${TOKEN_REPORTING_PUBLIC_BASE_PATH:-/tools/token-reporting}}"
DIST_ROOT="${TOKEN_REPORTING_DIST_ROOT:-${REPO_ROOT}/dist}"

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "run-production-service: node is not executable: ${NODE_BIN}" >&2
  exit 78
fi

if [[ ! -f "${TSX_CLI}" ]]; then
  echo "run-production-service: tsx CLI is missing: ${TSX_CLI}" >&2
  exit 78
fi

TOKEN_REPORTING_DIST_ROOT="${DIST_ROOT}" TOKEN_REPORTING_BASE_PATH="${BASE_PATH}" \
  bash "${REPO_ROOT}/scripts/verify-projectit-build.sh"

mkdir -p "$(dirname "${PID_FILE}")"
rm -f "${PID_FILE}"
echo "$$" >"${PID_FILE}"

cd "${REPO_ROOT}"
exec "${NODE_BIN}" "${TSX_CLI}" "${REPO_ROOT}/scripts/serve-production.ts"

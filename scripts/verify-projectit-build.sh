#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_ROOT="${TOKEN_REPORTING_DIST_ROOT:-${REPO_ROOT}/dist}"
BASE_PATH="${TOKEN_REPORTING_BASE_PATH:-${TOKEN_REPORTING_PUBLIC_BASE_PATH:-/tools/token-reporting}}"
BASE_PATH="/${BASE_PATH#/}"
BASE_PATH="${BASE_PATH%/}"
INDEX_HTML="${DIST_ROOT}/index.html"
EXPECTED_ASSET_PREFIX="${BASE_PATH}/assets/"

if [[ ! -f "${INDEX_HTML}" ]]; then
  echo "verify-projectit-build: ${INDEX_HTML} is missing; run npm run build:projectit." >&2
  exit 2
fi

if ! grep -Fq "${EXPECTED_ASSET_PREFIX}" "${INDEX_HTML}"; then
  cat >&2 <<MSG
verify-projectit-build: ${INDEX_HTML} is not built for ${BASE_PATH}.
Refusing to start or recover a mounted Token Reporting service from this artifact.
Run npm run build:projectit, then rerun the startup or recovery command.
MSG
  exit 2
fi

echo "verify-projectit-build: verified ${INDEX_HTML} for ${BASE_PATH}."

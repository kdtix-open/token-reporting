#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ALLOW_NON_DARWIN_FOR_TESTS="${TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS:-false}"
DRY_RUN="${TOKEN_REPORTING_LAUNCHD_DRY_RUN:-false}"
SKIP_PRECHECKS="${TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS:-false}"

if [[ "$(uname -s)" != "Darwin" && "${ALLOW_NON_DARWIN_FOR_TESTS}" != "true" ]]; then
  echo "install-macos-launchagent: run this on macOS, not $(uname -s)." >&2
  exit 2
fi

if [[ "${SKIP_PRECHECKS}" != "true" && -z "${TOKEN_REPORTING_NODE_BIN:-}" ]] && ! command -v node >/dev/null 2>&1; then
  echo "install-macos-launchagent: node is required." >&2
  exit 2
fi

NODE_BIN="${TOKEN_REPORTING_NODE_BIN:-$(command -v node || printf '/usr/bin/node')}"
if [[ ! "${NODE_BIN}" = /* ]]; then
  NODE_BIN="$(command -v "${NODE_BIN}")"
fi

if [[ "${SKIP_PRECHECKS}" != "true" && ! -x "${NODE_BIN}" ]]; then
  echo "install-macos-launchagent: resolved node is not executable: ${NODE_BIN}" >&2
  exit 2
fi

TSX_CLI="${TOKEN_REPORTING_TSX_CLI:-${REPO_ROOT}/node_modules/tsx/dist/cli.mjs}"
if [[ "${SKIP_PRECHECKS}" != "true" && ! -f "${TSX_CLI}" ]]; then
  echo "install-macos-launchagent: dependencies are missing; run npm install in ${REPO_ROOT} first." >&2
  exit 2
fi

if [[ "${SKIP_PRECHECKS}" != "true" && ! -d "${REPO_ROOT}/dist" ]]; then
  echo "install-macos-launchagent: dist is missing; run TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build first." >&2
  exit 2
fi

LABEL="${TOKEN_REPORTING_LAUNCHD_LABEL:-com.kdtix.token-reporting}"
HOST="${TOKEN_REPORTING_HOST:-0.0.0.0}"
PORT="${TOKEN_REPORTING_PORT:-8095}"
BASE_PATH="${TOKEN_REPORTING_BASE_PATH:-/tools/token-reporting}"
PUBLIC_BASE_PATH="${TOKEN_REPORTING_PUBLIC_BASE_PATH:-${BASE_PATH}}"
DATA_ROOT="${TOKEN_REPORTING_DATA_ROOT:-${REPO_ROOT}/public/data}"
DIST_ROOT="${TOKEN_REPORTING_DIST_ROOT:-${REPO_ROOT}/dist}"
LOG_ROOT="${TOKEN_REPORTING_LOG_ROOT:-${REPO_ROOT}/logs}"
ADMIN_ENV_FILE="${TOKEN_REPORTING_ADMIN_ENV_FILE:-${REPO_ROOT}/.env.admin.credentials}"
REFRESH_ASYNC="${TOKEN_REPORTING_REFRESH_ASYNC:-true}"
READ_ONLY="${TOKEN_REPORTING_READ_ONLY:-false}"
PID_FILE="${TOKEN_REPORTING_PID_FILE:-${REPO_ROOT}/tmp/projectit-token-reporting-production.pid}"
DEFAULT_LAUNCHD_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin"
LAUNCHD_PATH="${TOKEN_REPORTING_LAUNCHD_PATH:-${DEFAULT_LAUNCHD_PATH}}"
PLIST_DIR="${TOKEN_REPORTING_LAUNCHD_PLIST_DIR:-${HOME}/Library/LaunchAgents}"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"

for value in \
  "${NODE_BIN}" \
  "${TSX_CLI}" \
  "${REPO_ROOT}" \
  "${LOG_ROOT}" \
  "${PID_FILE}" \
  "${LAUNCHD_PATH}" \
  "${LABEL}"; do
  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
    echo "install-macos-launchagent: unsupported newline in path/value: ${value}" >&2
    exit 2
  fi
done

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  printf '%s' "${value}"
}

mkdir -p "${PLIST_DIR}" "${LOG_ROOT}" "$(dirname "${PID_FILE}")"
chmod +x "${REPO_ROOT}/scripts/run-production-service.sh"

cat >"${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "${LABEL}")</string>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "${REPO_ROOT}")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "${REPO_ROOT}/scripts/run-production-service.sh")</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TOKEN_REPORTING_NODE_BIN</key>
    <string>$(xml_escape "${NODE_BIN}")</string>
    <key>TOKEN_REPORTING_TSX_CLI</key>
    <string>$(xml_escape "${TSX_CLI}")</string>
    <key>PATH</key>
    <string>$(xml_escape "${LAUNCHD_PATH}")</string>
    <key>TOKEN_REPORTING_HOST</key>
    <string>$(xml_escape "${HOST}")</string>
    <key>TOKEN_REPORTING_PORT</key>
    <string>$(xml_escape "${PORT}")</string>
    <key>TOKEN_REPORTING_BASE_PATH</key>
    <string>$(xml_escape "${BASE_PATH}")</string>
    <key>TOKEN_REPORTING_PUBLIC_BASE_PATH</key>
    <string>$(xml_escape "${PUBLIC_BASE_PATH}")</string>
    <key>TOKEN_REPORTING_DATA_ROOT</key>
    <string>$(xml_escape "${DATA_ROOT}")</string>
    <key>TOKEN_REPORTING_DIST_ROOT</key>
    <string>$(xml_escape "${DIST_ROOT}")</string>
    <key>TOKEN_REPORTING_LOG_ROOT</key>
    <string>$(xml_escape "${LOG_ROOT}")</string>
    <key>TOKEN_REPORTING_ADMIN_ENV_FILE</key>
    <string>$(xml_escape "${ADMIN_ENV_FILE}")</string>
    <key>TOKEN_REPORTING_REFRESH_ASYNC</key>
    <string>$(xml_escape "${REFRESH_ASYNC}")</string>
    <key>TOKEN_REPORTING_READ_ONLY</key>
    <string>$(xml_escape "${READ_ONLY}")</string>
    <key>TOKEN_REPORTING_PID_FILE</key>
    <string>$(xml_escape "${PID_FILE}")</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$(xml_escape "${LOG_ROOT}/projectit-token-reporting-production.log")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "${LOG_ROOT}/projectit-token-reporting-production.log")</string>
</dict>
</plist>
EOF

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "install-macos-launchagent: dry run wrote ${PLIST_PATH}"
  exit 0
fi

launchctl bootout "gui/$(id -u)" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

cat <<MSG
Installed Token Reporting LaunchAgent:
  label: ${LABEL}
  plist: ${PLIST_PATH}
  node: ${NODE_BIN}
  port: ${PORT}
  base path: ${PUBLIC_BASE_PATH}

Status:
  launchctl print gui/$(id -u)/${LABEL}

Probe:
  curl http://127.0.0.1:${PORT}${PUBLIC_BASE_PATH}/api/integration/contract
MSG

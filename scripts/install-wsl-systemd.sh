#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "install-wsl-systemd: run this from inside WSL/Linux, not $(uname -s)." >&2
  exit 2
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "install-wsl-systemd: systemctl is required. Enable systemd in WSL first." >&2
  exit 2
fi

if ! systemctl --user show-environment >/dev/null 2>&1; then
  cat >&2 <<'MSG'
install-wsl-systemd: systemd --user is not available yet.
Enable systemd in WSL, restart the distro, then run this again:

  sudo sh -c 'printf "[boot]\nsystemd=true\n" > /etc/wsl.conf'
  wsl.exe --shutdown
MSG
  exit 2
fi

if [[ -z "${TOKEN_REPORTING_NODE_BIN:-}" ]] && ! command -v node >/dev/null 2>&1; then
  echo "install-wsl-systemd: node is required in WSL." >&2
  exit 2
fi

NODE_BIN="${TOKEN_REPORTING_NODE_BIN:-$(command -v node)}"
if command -v readlink >/dev/null 2>&1; then
  NODE_BIN="$(readlink -f "${NODE_BIN}")"
fi

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "install-wsl-systemd: resolved node is not executable: ${NODE_BIN}" >&2
  exit 2
fi

TSX_CLI="${TOKEN_REPORTING_TSX_CLI:-${REPO_ROOT}/node_modules/tsx/dist/cli.mjs}"
if [[ ! -f "${TSX_CLI}" ]]; then
  echo "install-wsl-systemd: dependencies are missing; run npm install in ${REPO_ROOT} first." >&2
  exit 2
fi

SERVICE_NAME="${TOKEN_REPORTING_SYSTEMD_SERVICE:-token-reporting.service}"
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

for value in \
  "${NODE_BIN}" \
  "${TSX_CLI}" \
  "${REPO_ROOT}" \
  "${LOG_ROOT}" \
  "${PID_FILE}" \
  "${SERVICE_NAME}"; do
  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* || "${value}" == *'"'* ]]; then
    echo "install-wsl-systemd: unsupported quote or newline in path/value: ${value}" >&2
    exit 2
  fi
done

escape_systemd_value() {
  local value="$1"
  value="${value//%/%%}"
  value="${value//$/\$\$}"
  printf '%s' "${value}"
}

UNIT_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/systemd/user"
UNIT_PATH="${UNIT_DIR}/${SERVICE_NAME}"

mkdir -p "${UNIT_DIR}" "${LOG_ROOT}" "$(dirname "${PID_FILE}")"

cat >"${UNIT_PATH}" <<EOF
[Unit]
Description=KDTIX Token Reporting
After=network.target sdlca-bridge.service
Wants=sdlca-bridge.service

[Service]
Type=simple
WorkingDirectory=$(escape_systemd_value "${REPO_ROOT}")
Environment="TOKEN_REPORTING_HOST=$(escape_systemd_value "${HOST}")"
Environment="TOKEN_REPORTING_PORT=$(escape_systemd_value "${PORT}")"
Environment="TOKEN_REPORTING_BASE_PATH=$(escape_systemd_value "${BASE_PATH}")"
Environment="TOKEN_REPORTING_PUBLIC_BASE_PATH=$(escape_systemd_value "${PUBLIC_BASE_PATH}")"
Environment="TOKEN_REPORTING_DATA_ROOT=$(escape_systemd_value "${DATA_ROOT}")"
Environment="TOKEN_REPORTING_DIST_ROOT=$(escape_systemd_value "${DIST_ROOT}")"
Environment="TOKEN_REPORTING_LOG_ROOT=$(escape_systemd_value "${LOG_ROOT}")"
Environment="TOKEN_REPORTING_ADMIN_ENV_FILE=$(escape_systemd_value "${ADMIN_ENV_FILE}")"
Environment="TOKEN_REPORTING_REFRESH_ASYNC=$(escape_systemd_value "${REFRESH_ASYNC}")"
Environment="TOKEN_REPORTING_READ_ONLY=$(escape_systemd_value "${READ_ONLY}")"
Environment="TOKEN_REPORTING_PID_FILE=$(escape_systemd_value "${PID_FILE}")"
ExecStartPre=/usr/bin/rm -f "$(escape_systemd_value "${PID_FILE}")"
ExecStart="$(escape_systemd_value "${NODE_BIN}")" "$(escape_systemd_value "${TSX_CLI}")" "$(escape_systemd_value "${REPO_ROOT}/scripts/serve-production.ts")"
Restart=on-failure
RestartSec=5
StandardOutput=append:$(escape_systemd_value "${LOG_ROOT}/projectit-token-reporting-production.log")
StandardError=append:$(escape_systemd_value "${LOG_ROOT}/projectit-token-reporting-production.log")

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}"

if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "${USER}" >/dev/null 2>&1 || true
fi

cat <<MSG
Installed Token Reporting startup:
  service: ${SERVICE_NAME}
  unit: ${UNIT_PATH}
  node: ${NODE_BIN}
  port: ${PORT}

Status:
  systemctl --user status ${SERVICE_NAME}

Probe:
  curl http://127.0.0.1:${PORT}${BASE_PATH}/api/integration/contract
MSG

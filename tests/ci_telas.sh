#!/bin/bash
# Testes de tela (navegador de verdade, Playwright/Chromium) num banco de TESTE descartável.
# Uso (CI ou local): PGURL=postgres://usuario:senha@127.0.0.1:5432 bash tests/ci_telas.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?defina PGURL (sem o nome do banco)}"
SSL="${PGSSL:-disable}"
LOGS="$(mktemp -d)"; PID=""
trap '[ -n "$PID" ] && kill "$PID" 2>/dev/null || true' EXIT
gen() { python3 -c "import secrets;print('Tt'+secrets.token_hex(10)+'9a')"; }
export CENTRAL_PASSWORD="$(gen)" SETUP_CODE="codigo-$(gen)"
export CENTRAL_HASH="$(node -e "require('./lib/auth').hashPassword(process.env.CENTRAL_PASSWORD).then(h=>console.log(h))")"
export DEV_INSECURE_COOKIE=1 PG_INSECURE_TLS=1
psql "$PGURL/postgres" -q -c "drop database if exists tino_ci_telas with (force)" -c "create database tino_ci_telas"
P="$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1])")"
DATABASE_URL="$PGURL/tino_ci_telas?sslmode=$SSL" PORT=$P node scripts/dev-server.js > "$LOGS/srv.log" 2>&1 & PID=$!
for i in $(seq 1 50); do curl -sf "localhost:$P/api/health" >/dev/null && break; sleep 0.2; done
APW="$(gen)"
curl -sf -X POST "localhost:$P/api/setup" -H 'Content-Type: application/json' -H 'X-App: 1' \
  -d "{\"code\":\"$SETUP_CODE\",\"name\":\"Dono\",\"login\":\"eduardo\",\"password\":\"$APW\"}" >/dev/null
BASE=http://localhost:$P ADMIN_LOGIN=eduardo ADMIN_PASSWORD="$APW" python3 tests/telas.py || { echo "--- log do servidor"; tail -40 "$LOGS/srv.log"; exit 1; }

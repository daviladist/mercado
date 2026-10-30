#!/bin/bash
# Testes com banco de verdade (Central + separação por empresa), em bancos de TESTE descartáveis.
# Uso (CI ou local): PGURL=postgres://usuario:senha@127.0.0.1:5432 bash tests/ci_banco.sh
# Senhas sorteadas a cada execução; nada de senha escrita no repositório.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?defina PGURL (sem o nome do banco)}"
SSL="${PGSSL:-disable}"
gen() { python3 -c "import secrets;print('Tt'+secrets.token_hex(10)+'9a')"; }
export CENTRAL_PASSWORD="$(gen)" SETUP_CODE="codigo-$(gen)"
export CENTRAL_HASH="$(node -e "require('./lib/auth').hashPassword(process.env.CENTRAL_PASSWORD).then(h=>console.log(h))")"
export DEV_INSECURE_COOKIE=1 PG_INSECURE_TLS=1
run() { # banco porta
  python3 - "$1" <<PY
import subprocess,sys,os
db=sys.argv[1]; base=os.environ['PGURL']
subprocess.run(['psql',base+'/postgres','-q','-c',f'drop database if exists {db}','-c',f'create database {db}'],check=True)
PY
  DATABASE_URL="$PGURL/$1?sslmode=$SSL" PORT=$2 node scripts/dev-server.js > "/tmp/srv-$2.log" 2>&1 &
  for i in $(seq 1 50); do curl -sf "localhost:$2/api/health" >/dev/null && return 0; sleep 0.2; done
  cat "/tmp/srv-$2.log"; return 1
}
run tino_ci_central 3301
BASE=http://localhost:3301 python3 tests/central.py
run tino_ci_multi 3302
APW="$(gen)"
curl -sf -X POST localhost:3302/api/setup -H 'Content-Type: application/json' -H 'X-App: 1' \
  -d "{\"code\":\"$SETUP_CODE\",\"name\":\"Dono\",\"login\":\"eduardo\",\"password\":\"$APW\"}" >/dev/null
BASE=http://localhost:3302 ADMIN_LOGIN=eduardo ADMIN_PASSWORD="$APW" python3 tests/multiempresa.py
echo "Testes com banco: tudo certo."

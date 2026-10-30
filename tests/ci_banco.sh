#!/bin/bash
# Testes com banco de verdade, em bancos de TESTE descartáveis:
#  1. atualização do banco no formato que está no ar (com dados) para o formato novo, rodando 2 vezes;
#  2. Central do sistema;  3. separação por empresa.
# Uso (CI ou local): PGURL=postgres://usuario:senha@127.0.0.1:5432 bash tests/ci_banco.sh
# Senhas sorteadas a cada execução; nada de senha escrita no repositório.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?defina PGURL (sem o nome do banco)}"
SSL="${PGSSL:-disable}"
LOGS="$(mktemp -d)"; PIDS=()
trap 'for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done' EXIT
gen() { python3 -c "import secrets;print('Tt'+secrets.token_hex(10)+'9a')"; }
newdb() { psql "$PGURL/postgres" -q -c "drop database if exists $1 with (force)" -c "create database $1"; }
export CENTRAL_PASSWORD="$(gen)" SETUP_CODE="codigo-$(gen)"
export CENTRAL_HASH="$(node -e "require('./lib/auth').hashPassword(process.env.CENTRAL_PASSWORD).then(h=>console.log(h))")"
export DEV_INSECURE_COOKIE=1 PG_INSECURE_TLS=1
porta() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1])"; }
serve() { # banco -> sobe o servidor deste código numa porta livre e confere que é ELE que responde
  local p; p="$(porta)"
  DATABASE_URL="$PGURL/$1?sslmode=$SSL" PORT=$p node scripts/dev-server.js > "$LOGS/$1.log" 2>&1 &
  local pid=$!; PIDS+=("$pid")
  for i in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || { cat "$LOGS/$1.log"; echo "servidor não subiu"; exit 1; }
    curl -sf "localhost:$p/api/health" >/dev/null && { kill -0 "$pid" || exit 1; PORTA=$p; return 0; }
    sleep 0.2
  done
  cat "$LOGS/$1.log"; exit 1
}

echo "== 1. Atualização do banco que está no ar"
newdb tino_ci_migr
psql "$PGURL/tino_ci_migr" -q -v ON_ERROR_STOP=1 -f tests/fixtures/schema_no_ar_f80a1ba.sql -f tests/fixtures/dados_no_ar.sql
for vez in 1 2; do DATABASE_URL="$PGURL/tino_ci_migr?sslmode=$SSL" node -e "require('./lib/schema').ensureSchema().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"; done
q() { psql "$PGURL/tino_ci_migr" -tAq -c "$1"; }
[ "$(q "select count(*) from docs_t where tenant_id='davila'")" = "7" ] || { echo "FALHA: registros não ficaram na empresa principal"; exit 1; }
[ "$(q "select count(*) from users_t where tenant_id='davila'")" = "3" ] || { echo "FALHA: usuários"; exit 1; }
[ "$(q "select count(*) from photos_t where tenant_id='davila'")" = "1" ] || { echo "FALHA: fotos"; exit 1; }
[ "$(q "select last_no from order_seq where tenant_id='davila'")" = "1002" ] || { echo "FALHA: numeração dos pedidos"; exit 1; }
[ "$(q "select count(*) from schema_version")" = "1" ] || { echo "FALHA: schema_version"; exit 1; }
if q "insert into docs_t(coll,id,data) values('products','px','{}')" 2>/dev/null; then echo "FALHA: gravou sem empresa"; exit 1; fi
if q "insert into docs_t(tenant_id,coll,id,data) values('nao-existe','products','px','{}')" 2>/dev/null; then echo "FALHA: gravou em empresa inexistente"; exit 1; fi
[ "$(q "select to_regclass('public.docs') is null and to_regclass('public.users') is null")" = "t" ] || { echo "FALHA: nomes antigos das tabelas continuam existindo"; exit 1; }
echo "  OK   dados, usuários, fotos e numeração preservados; rodar 2x não estraga; sem empresa é recusado; nomes antigos não existem (versão antiga não lê)"

echo "== 2. Central do sistema"
newdb tino_ci_central; serve tino_ci_central
BASE=http://localhost:$PORTA python3 tests/central.py

echo "== 3. Separação por empresa"
newdb tino_ci_multi; serve tino_ci_multi
APW="$(gen)"
curl -sf -X POST "localhost:$PORTA/api/setup" -H 'Content-Type: application/json' -H 'X-App: 1' \
  -d "{\"code\":\"$SETUP_CODE\",\"name\":\"Dono\",\"login\":\"eduardo\",\"password\":\"$APW\"}" >/dev/null
BASE=http://localhost:$PORTA ADMIN_LOGIN=eduardo ADMIN_PASSWORD="$APW" python3 tests/multiempresa.py
echo "== 4. Caixa de balcão (PDV)"
newdb tino_ci_pdv; serve tino_ci_pdv
APW="$(gen)"
curl -sf -X POST "localhost:$PORTA/api/setup" -H 'Content-Type: application/json' -H 'X-App: 1' \
  -d "{\"code\":\"$SETUP_CODE\",\"name\":\"Dono\",\"login\":\"eduardo\",\"password\":\"$APW\"}" >/dev/null
BASE=http://localhost:$PORTA ADMIN_LOGIN=eduardo ADMIN_PASSWORD="$APW" python3 tests/pdv.py
echo "== 5. Frete de terceiro"
newdb tino_ci_frete; serve tino_ci_frete
APW="$(gen)"
curl -sf -X POST "localhost:$PORTA/api/setup" -H 'Content-Type: application/json' -H 'X-App: 1' \
  -d "{\"code\":\"$SETUP_CODE\",\"name\":\"Dono\",\"login\":\"eduardo\",\"password\":\"$APW\"}" >/dev/null
BASE=http://localhost:$PORTA ADMIN_LOGIN=eduardo ADMIN_PASSWORD="$APW" python3 tests/frete.py
echo "Testes com banco: tudo certo."

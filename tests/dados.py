"""Qualidade dos dados de dinheiro no servidor: pedido a prazo concluído sem prazo identificado
não pode ficar sem cobrança nem devolver o limite de crédito ao cliente. Banco de TESTE vazio com o administrador criado.
Uso: BASE=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/dados.py
Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, urllib.request, http.cookiejar
from datetime import datetime, timezone
BASE = os.environ.get('BASE', 'http://localhost:3077')
AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class C:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None):
        h = {'Content-Type': 'application/json', 'X-App': '1', 'X-Tenant': '@'} if body is not None else {'X-Tenant': '@'}
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: d = x.read(); return x.status, json.loads(d or b'{}')
        except urllib.error.HTTPError as e:
            d = e.read()
            try: return e.code, json.loads(d or b'{}')
            except ValueError: return e.code, {'error': d.decode(errors='replace')[:200]}
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
def rej(r): return [x.get('error') for x in (r.get('rejected') or [])]

A = C(); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador entra')
CP = pw()
s, r = A.req('/api/sync', {'changes': [
    {'c': 'meta', 'id': 'store', 'op': 'put', 'doc': {'name': 'LOJA DADOS', 'min': 0, 'autoRec': True}},
    {'c': 'meta', 'id': 'payments', 'op': 'put', 'doc': ['PIX', 'Boleto', 'Boleto 28 dias']},
    {'c': 'meta', 'id': 'cashPays', 'op': 'put', 'doc': ['PIX']},
    {'c': 'meta', 'id': 'payDays', 'op': 'put', 'doc': {'Boleto 28 dias': '28'}},
    {'c': 'products', 'id': 'pf', 'op': 'put', 'doc': {'id': 'pf', 'name': 'Feijão', 'price': 10, 'unit': 'UN', 'active': True, 'stock': 100}},
    {'c': 'customers', 'id': 'cd1', 'op': 'put', 'doc': {'id': 'cd1', 'name': 'Mercado Dados', 'login': 'cli.dados', 'pass': CP, 'creditLimit': 1000}}]})
check(s == 200 and not r.get('rejected'), 'loja, formas, produto e cliente com limite de R$ 1.000 gravados (%s %s)' % (s, rej(r) or r.get('error')))
cli = C(); s, _ = cli.req('/api/login', {'role': 'cliente', 'login': 'cli.dados', 'password': CP})
NP = CP + 'N'; cli.req('/api/password', {'current': CP, 'next': NP}); check(s == 200, 'cliente entra')

now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
o = {'id': 'od1', 'date': now, 'customerId': 'cd1', 'customer': 'Mercado Dados', 'status': 'saiu', 'pay': 'Boleto', 'mode': 'retirada',
     'items': [{'pid': 'pf', 'name': 'Feijão', 'q': 80, 'price': 10}], 'sub': 800, 'disc': 0, 'total': 800}
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'od1', 'op': 'put', 'doc': o}]})
check(s == 200 and not r.get('rejected'), 'pedido de R$ 800 em "Boleto" (sem prazo cadastrado) lançado')
s, st = A.req('/api/state'); ver = st['V']['orders']['od1']; cur = next(x for x in st['S']['orders'] if x['id'] == 'od1')
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'od1', 'op': 'put', 'ver': ver, 'doc': dict(cur, status='concluido')}]})
check(s == 200 and not r.get('rejected'), 'pedido concluído pela loja')
s, st = A.req('/api/state')
recs = [x for x in st['S'].get('receivables', []) if x.get('orderId') == 'od1']
done = next(x for x in st['S']['orders'] if x['id'] == 'od1')
check(len(recs) == 0 and not done.get('recLaunched'), 'sem prazo identificado: nenhuma parcela inventada (fica para a loja lançar)')
check(next(p for p in st['S']['products'] if p['id'] == 'pf')['stock'] == 20, 'estoque baixou 80 uma vez só (100 -> 20)')
ped = {'items': [{'pid': 'pf', 'q': 30, 'price': 10}], 'mode': 'retirada', 'pay': 'Boleto 28 dias'}
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'od2', 'op': 'put', 'doc': ped}]})
check(s == 200 and len(rej(r)) == 1 and 'limite' in (rej(r)[0] or ''), 'cliente pede mais R$ 300 a prazo: recusado pelo limite (os R$ 800 sem conta continuam contando) (%s %s)' % (s, rej(r)))
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'od3', 'op': 'put', 'doc': dict(ped, pay='PIX')}]})
check(s == 200 and not r.get('rejected'), 'à vista continua liberado')
# loja lança a conta pelo botão do pedido: o pedido deixa de contar em dobro
s, st = A.req('/api/state'); ver = st['V']['orders']['od1']; cur = next(x for x in st['S']['orders'] if x['id'] == 'od1')
s, r = A.req('/api/sync', {'changes': [
    {'c': 'receivables', 'id': 'rd1', 'op': 'put', 'doc': {'id': 'rd1', 'orderId': 'od1', 'customerId': 'cd1', 'customer': 'Mercado Dados', 'orderNo': str(cur['no']), 'parcel': '1/1', 'amount': 800, 'due': '2099-01-01', 'paidAt': ''}},
    {'c': 'orders', 'id': 'od1', 'op': 'put', 'ver': ver, 'doc': dict(cur, recLaunched=True)}]})
check(s == 200 and not r.get('rejected'), 'loja lança a parcela do pedido')
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'od4', 'op': 'put', 'doc': dict(ped, items=[{'pid': 'pf', 'q': 15, 'price': 10}])}]})
check(s == 200 and not r.get('rejected'), 'com a parcela lançada, R$ 150 a prazo cabem no limite (800 + 150 <= 1000): conta uma vez só (%s)' % rej(r))

print('\n%d verificações OK, %d falhas' % (ok, len(fails)))
if fails:
    print('FALHAS:'); [print(' -', f) for f in fails]; sys.exit(1)

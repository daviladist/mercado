"""Robustez do servidor: empresa sem configuração, backup malformado, envio grande em partes,
registro com lixo que não pode travar o resto do envio. Banco de TESTE vazio com o administrador da principal criado.
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/robustez.py
Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, urllib.request, http.cookiejar
BASE = os.environ.get('BASE', 'http://localhost:3077')
CPW = os.environ['CENTRAL_PASSWORD']; AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class C:
    def __init__(self, t='@'):
        self.t = t; self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if self.t: h['X-Tenant'] = self.t
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: d = x.read(); return x.status, json.loads(d or b'{}')
        except urllib.error.HTTPError as e:
            d = e.read()
            try: return e.code, json.loads(d or b'{}')
            except ValueError: return e.code, {'error': d.decode(errors='replace')[:200]}
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
def rej(r): return [x.get('error') for x in (r.get('rejected') or [])]
def login(t, role, lg, p):
    c = C(t); s, _ = c.req('/api/login', {'role': role, 'login': lg, 'password': p})
    if s != 200: return None
    np = p + 'N'; c.req('/api/password', {'current': p, 'next': np}); return c

A = C(); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador entra')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'Central entra')

print('== 1. empresa principal recém-instalada (sem "store" e sem formas de pagamento gravadas)')
s, st = A.req('/api/state'); check(s == 200 and 'store' not in st['S'] and 'payments' not in st['S'], 'banco novo: sem configuração da loja gravada')
CP, VP = pw(), pw()
s, r = A.req('/api/sync', {'changes': [
    {'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'Arroz 5kg', 'price': 25, 'unit': 'UN', 'active': True}},
    {'c': 'sellers', 'id': 'sv1', 'op': 'put', 'doc': {'id': 'sv1', 'name': 'Vendedor', 'login': 'vend.rob', 'pass': VP, 'allCli': True}},
    {'c': 'customers', 'id': 'cl1', 'op': 'put', 'doc': {'id': 'cl1', 'name': 'Mercado Um', 'login': 'cli.rob', 'pass': CP, 'sellerId': 'sv1'}}]})
check(s == 200 and not r.get('rejected'), 'produto, vendedor e cliente gravados')
cli = login('@', 'cliente', 'cli.rob', CP); ven = login('@', 'vendedor', 'vend.rob', VP)
check(cli is not None and ven is not None, 'cliente e vendedor entram')
ped = {'items': [{'pid': 'pa', 'q': 2, 'price': 25}], 'mode': 'retirada', 'pay': 'PIX', 'customerId': 'cl1', 'sellerId': 'sv1'}
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'rc1', 'op': 'put', 'doc': ped}]})
check(s == 200 and rej(r) == ['Escolha uma forma de pagamento.'], 'pedido do cliente sem formas de pagamento: recusado com motivo, sem erro no servidor (%s %s)' % (s, rej(r) or r.get('error')))
s, r = ven.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'rv1', 'op': 'put', 'doc': ped}]})
check(s == 200 and len(rej(r)) == 1, 'pedido do vendedor sem formas de pagamento: recusado com motivo (%s %s)' % (s, rej(r) or r.get('error')))
s, r = ven.req('/api/lock', {'cid': 'cl1', 'cart': {'pa': 2}, 'mode': 'retirada', 'pay': 'PIX'}); check(s == 200, 'trava de margem do vendedor responde sem loja configurada (%s)' % s)
s, r = cli.req('/api/neg', {'pid': 'pa', 'asked': 20, 'q': 1}); check(s == 200, 'consulta de negociação responde sem loja configurada (%s)' % s)
s, r = A.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'payments', 'op': 'put', 'doc': ['PIX', 'Dinheiro']}]}); check(s == 200 and not r.get('rejected'), 'administrador grava as formas de pagamento')
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'rc2', 'op': 'put', 'doc': ped}]}); check(s == 200 and not r.get('rejected') and r['docs'], 'pedido do cliente grava (ainda sem "store" gravado)')
s, r = ven.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'rv2', 'op': 'put', 'doc': ped}]}); check(s == 200 and not r.get('rejected') and r['docs'], 'pedido do vendedor grava (ainda sem "store" gravado)')
s, r = A.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'constructor', 'op': 'put', 'doc': {'a': 1}}]}); check(s == 200 and not r.get('rejected'), 'configuração com nome "constructor" grava normalmente (sem conflito falso)')

print('== 2. registro com lixo não trava o resto do envio')
bons = {'c': 'orders', 'id': 'rc3', 'op': 'put', 'doc': ped}
for nome, doc in [('item nulo', dict(ped, items=[None])), ('itens como objeto', dict(ped, items={'a': 1})), ('itens como texto', dict(ped, items='x'))]:
    s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'lx' + secrets.token_hex(3), 'op': 'put', 'doc': doc}]})
    check(s == 200 and len(rej(r)) == 1, 'cliente, pedido com %s: recusado só ele (%s %s)' % (nome, s, rej(r) or r.get('error')))
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'lx-null', 'op': 'put', 'doc': dict(ped, items=[None])}, bons]})
check(s == 200 and len(rej(r)) == 1 and any(d['id'] == 'rc3' for d in r['docs']), 'lote com 1 pedido estragado + 1 bom: o bom grava (%s %s)' % (s, rej(r) or r.get('error')))
s, st = cli.req('/api/state'); o = next(x for x in st['S']['orders'] if x['id'] == 'rc2'); ver = st['V']['orders']['rc2']
for nome, val in [('texto', 'x'), ('objeto', {}), ('item nulo', [None])]:
    s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'rc2', 'op': 'put', 'ver': ver, 'doc': dict(o, items=val)}]})
    check(s == 200 and len(rej(r)) == 1, 'cliente alterando pedido com itens = %s: recusado com motivo (%s %s)' % (nome, s, rej(r) or r.get('error')))
adm_o = {'id': 'ra1', 'date': '2026-11-01T12:00:00.000Z', 'customerId': 'cl1', 'customer': 'Mercado Um', 'status': 'novo', 'pay': 'PIX', 'mode': 'retirada',
         'items': [{'pid': 'pa', 'name': 'Arroz 5kg', 'q': 1, 'price': 25, 'base': 25}], 'sub': 25, 'disc': 0, 'total': 25}
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'ra1', 'op': 'put', 'doc': dict(adm_o, events=[None, {'text': 'Pedido nº {NO}'}])}]})
check(s == 200 and not r.get('rejected') and r['docs'][0]['doc']['events'][1]['text'] != 'Pedido nº {NO}', 'administrador: pedido com evento nulo grava e numera (%s %s)' % (s, r.get('error')))
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'ra2', 'op': 'put', 'doc': dict(adm_o, id='ra2', no=1e20)}]})
n2 = (r.get('docs') or [{}])[0].get('doc', {}).get('no')
check(s == 200 and isinstance(n2, int) and n2 < 10 ** 9, 'administrador: número de pedido absurdo é ignorado e o servidor numera (%s %s)' % (s, n2))
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'ra3', 'op': 'put', 'doc': dict(adm_o, id='ra3')}]})
n3 = (r.get('docs') or [{}])[0].get('doc', {}).get('no'); check(s == 200 and n3 == n2 + 1, 'numeração segue normal depois (%s → %s)' % (n2, n3))

print('== 3. envio grande: o servidor aceita até 500 alterações por vez; o app manda em partes')
big = [{'c': 'products', 'id': 'bk%d' % i, 'op': 'put', 'doc': {'id': 'bk%d' % i, 'name': 'Produto %d' % i, 'price': 10, 'unit': 'UN', 'active': True}} for i in range(600)]
s, r = A.req('/api/sync', {'changes': big}); check(s == 400, '600 alterações de uma vez: recusado (%s)' % s)
s1, r1 = A.req('/api/sync', {'changes': big[:400]}); s2, r2 = A.req('/api/sync', {'changes': big[400:]})
s, st = A.req('/api/state'); n = sum(1 for p in st['S']['products'] if p['id'].startswith('bk'))
check(s1 == 200 and s2 == 200 and n == 600, '600 produtos em 2 partes (400 + 200), como o app faz: todos gravados (%s)' % n)

print('== 4. backup malformado não derruba a empresa')
s, r = cen.req('/api/central/tenant', {'name': 'Empresa Robustez', 'status': 'ativa', 'modules': {'app_cliente': True}}); tid = r['tenant']['id']
s, r = cen.req('/api/central/tenant-admin', {'id': tid, 'login': 'admin'}); B = login(tid, 'admin', 'admin', r['password']); check(B is not None, 'administrador da empresa nova entra')
s, st = B.req('/api/state'); check(s == 200 and 'payments' not in st['S'], 'empresa nova vem só com o nome da loja (sem formas de pagamento)')
s, r = B.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'Feijão', 'price': 9, 'unit': 'UN', 'active': True}},
    {'c': 'customers', 'id': 'cl1', 'op': 'put', 'doc': {'id': 'cl1', 'name': 'Cliente B', 'login': 'cli.b', 'pass': CP}}]}); check(s == 200 and not r.get('rejected'), 'produto e cliente gravados')
cb = login(tid, 'cliente', 'cli.b', CP)
s, r = cb.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'b1', 'op': 'put', 'doc': ped}]}); check(s == 200 and len(rej(r)) == 1, 'empresa nova: pedido do cliente sem formas de pagamento é recusado com motivo (%s)' % s)
for nome, data in [('clientes como objeto', {'products': [], 'customers': {'a': 1}}), ('pedidos como texto', {'products': [], 'orders': 'x'}),
                   ('arquivo como lista', [1, 2]), ('sem produtos', {'customers': []})]:
    s, r = B.req('/api/restore', {'data': data}); check(s == 400, 'restaurar com %s: recusado com aviso (%s %s)' % (nome, s, r.get('error')))
    s, st = B.req('/api/state'); check(s == 200 and any(p['id'] == 'pa' for p in st['S']['products']), '... e a empresa continua abrindo com os dados de antes')
s, bk = B.req('/api/backup'); check(s == 200, 'backup da empresa')
s, r = B.req('/api/restore', {'data': {'products': [{'id': 'pa', 'name': 'Feijão', 'price': 9, 'unit': 'UN', 'active': True}], 'orders': [None, {'id': 'x1', 'no': 'abc', 'items': []}, {'id': 'x2', 'no': 5000, 'items': []}], 'seq': 1e30}})
check(s == 200, 'restaurar com pedido nulo e numeração estranha: aceito, o que é lixo fica de fora (%s %s)' % (s, r.get('error')))
s, st = B.req('/api/state'); check(s == 200 and 'store' not in st['S'] and st['S']['seq'] == 5001, 'restaurado sem "store": empresa abre e a numeração segue o maior pedido (%s)' % st['S'].get('seq'))
s, r = B.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'payments', 'op': 'put', 'doc': ['PIX']}, {'c': 'customers', 'id': 'cl1', 'op': 'put', 'doc': {'id': 'cl1', 'name': 'Cliente B', 'login': 'cli.b', 'pass': CP}}]})
check(s == 200 and not r.get('rejected'), 'formas de pagamento e cliente de volta')
cb = login(tid, 'cliente', 'cli.b', CP)
s, r = cb.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'b2', 'op': 'put', 'doc': ped}]}) if cb else (0, {})
check(s == 200 and not r.get('rejected') and r.get('docs'), 'loja restaurada sem "store": pedido do cliente grava (%s %s)' % (s, rej(r) or r.get('error')))

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

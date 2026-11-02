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

print('== 5. papéis: troca aprovada pelo vendedor e rotas novas (ranking do balcão, última compra)')
XP = pw()
s, r = A.req('/api/sync', {'changes': [
    {'c': 'products', 'id': 'pb', 'op': 'put', 'doc': {'id': 'pb', 'name': 'Feijão 1kg', 'price': 9, 'cost': 7, 'unit': 'UN', 'active': True}},
    {'c': 'cashiers', 'id': 'cx1', 'op': 'put', 'doc': {'id': 'cx1', 'name': 'Caixa', 'login': 'cx.rob', 'pass': XP}},
    {'c': 'orders', 'id': 'rs1', 'op': 'put', 'doc': dict(adm_o, id='rs1', sellerId='sv1', status='separando', chk={'pa': True},
        sugs=[{'id': 'sg1', 'type': 'troca', 'status': 'pendente', 'fromKey': 'pa', 'fromName': 'Arroz 5kg', 'pid': 'pb', 'name': 'Feijão 1kg', 'q': 2, 'toSeller': True}])}]})
check(s == 200 and not r.get('rejected'), 'pedido em separação com troca esperando o vendedor')
s, st = ven.req('/api/state'); o = next(x for x in st['S']['orders'] if x['id'] == 'rs1'); ver = st['V']['orders']['rs1']
d = json.loads(json.dumps(o)); d['sugs'][0].update({'status': 'aprovada', 'decBy': 'Vendedor', 'sellerSeen': True})
d['items'][0] = {'pid': 'pb', 'name': 'Feijão 1kg', 'q': 2, 'price': 9, 'base': 9}; d['chk'] = {'pb': True}   # como o app faz (approveSug)
s, r = ven.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'rs1', 'op': 'put', 'ver': ver, 'doc': d}]})
doc = (r.get('docs') or [{}])[0].get('doc', {})
check(s == 200 and not r.get('rejected') and doc.get('items', [{}])[0].get('pid') == 'pb' and doc.get('sugs', [{}])[0].get('status') == 'aprovada',
      'vendedor aprova a troca pelo app (com a marcação de conferido): grava e troca o item (%s %s)' % (s, rej(r) or r.get('error')))
s, cs = cen.req('/api/central/state'); dav = next(t for t in cs['tenants'] if t['primary']); cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'pdv': True}})
cx = login('@', 'operador_caixa', 'cx.rob', XP); check(cx is not None, 'operador de caixa entra')
for nome, c in [('operador de caixa', cx), ('vendedor', ven), ('cliente', cli)]:
    s, r = c.req('/api/pdv/itens?de=2026-01-01&ate=2026-12-31'); check(s == 403, 'ranking do balcão (com custo) recusado para %s (%s)' % (nome, s))
s, r = A.req('/api/pdv/itens?de=2026-01-01&ate=2026-12-31'); check(s == 200 and 'itens' in r, 'ranking do balcão responde para o administrador (%s)' % s)
s, r = A.req('/api/pdv/itens?de=2026-12-31&ate=2026-01-01'); check(s == 400, 'período invertido é recusado (%s)' % s)
s, st = cli.req('/api/state'); check(not any('lastBuyAt' in c for c in st['S']['customers']), 'cliente não recebe "última compra" de ninguém')
s, st = ven.req('/api/state'); check(all(set(c) <= {'id', 'name', 'phone', 'address', 'bairro', 'city', 'doc', 'fiscal', 'ieOk', 'pays', 'sellerId', 'creditLimit', 'canNeg', 'table', 'lastBuyAt'} for c in st['S']['customers']),
      'vendedor recebe só os dados combinados dos clientes (+ data da última compra)')

print('== 6. restaurar apaga fotos que ninguém usa mais')
FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
s, r = B.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pf', 'op': 'put', 'doc': {'id': 'pf', 'name': 'Com foto', 'price': 1, 'unit': 'UN', 'photo': FOTO}}]})
url = (r.get('docs') or [{}])[0].get('doc', {}).get('photo', '')
check(url.startswith('/api/photo/'), 'foto do produto guardada à parte (%s)' % url[:40])
s, bk = B.req('/api/backup')
s, r = B.req('/api/restore', {'data': {'products': [{'id': 'pa', 'name': 'Feijão', 'price': 9, 'unit': 'UN'}]}})
check(s == 200 and r['stats']['photos'] == 0, 'restaurar um arquivo sem a foto: foto que ninguém usa sai do banco (fotos: %s)' % r.get('stats', {}).get('photos'))
s, r = B.req('/api/restore', {'data': bk['data']})
check(s == 200 and r['stats']['photos'] == 1, 'restaurar o backup completo traz a foto de volta (fotos: %s)' % r.get('stats', {}).get('photos'))

print('== 7. painel de erros do servidor na Central')
s, r = cen.req('/api/central/errors-seen', {'all': True}); check(s == 200 and r['unseen'] == 0, 'Central começa sem erros não vistos')
for _ in range(3): s, r = B.req('/api/teste-erro')
check(s == 500 and r.get('error') == 'Erro no servidor. Tente de novo.', 'erro inesperado responde "tente de novo" sem detalhe técnico (%s)' % s)
s, st = cen.req('/api/central/state'); check(st.get('errUnseen') == 1, 'contador da Central: 1 erro não visto (o mesmo erro 3 vezes soma) (%s)' % st.get('errUnseen'))
s, E = cen.req('/api/central/errors'); e = (E.get('errors') or [{}])[0]
check(e.get('tenant_id') == tid and e.get('route') == '/api/teste-erro' and e.get('n') == 3 and 'forcado' in e.get('message', '') and str(e.get('place', '')).startswith('lib/api.js:'),
      'erro registrado com empresa, rota, mensagem, lugar no código e 3 vezes: %s' % {k: e.get(k) for k in ('tenant_id', 'route', 'n', 'message', 'place')})
s, r = B.req('/api/central/errors'); check(s in (401, 403), 'administrador de empresa não vê o painel de erros (%s)' % s)
s, r = cen.req('/api/central/errors-seen', {'ids': [e.get('id')]}); check(s == 200 and r['unseen'] == 0, 'marcar como visto zera o contador')
s, E = cen.req('/api/central/errors'); check(E['errors'][0]['seen'] is True, 'erro continua na lista, marcado como visto')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

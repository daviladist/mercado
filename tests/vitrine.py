"""Vitrine semanal x catálogo fixo, regra de estoque na vitrine e PDV vendendo todo o cadastro (banco de TESTE).
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/vitrine.py
Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, urllib.request, http.cookiejar, concurrent.futures as cf
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
    def req(self, path, body=None, raw=False):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if self.t: h['X-Tenant'] = self.t
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: d = x.read(); return x.status, (d.decode() if raw else json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); return e.code, (d.decode() if raw else json.loads(d or b'{}'))
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
import datetime
hoje = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date()
ontem, amanha = str(hoje - datetime.timedelta(days=1)), str(hoje + datetime.timedelta(days=1))

A = C(); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador entra')
cen = C(None); cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW})
s, cs = cen.req('/api/central/state'); dav = next(t for t in cs['tenants'] if t['primary'])
s, r = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'pdv': True, 'ofertas': True}})
def meta(id, doc):
    s, st = A.req('/api/state'); return A.req('/api/sync', {'changes': [{'c': 'meta', 'id': id, 'op': 'put', 'doc': doc, 'ver': st['V']['meta'].get(id)}]})
def loja(**kw):
    s, st = A.req('/api/state'); d = dict(st['S'].get('store') or {'name': 'LOJA TESTE'}); d.update(kw); return meta('store', d)
CPW2, SPW, OPW = pw(), pw(), pw()
ch = [
  {'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'Arroz 5kg', 'price': 25, 'cost': 20, 'stock': 100, 'code': '101', 'ean': '7890000000011', 'unit': 'UN', 'active': True}},
  {'c': 'products', 'id': 'pz', 'op': 'put', 'doc': {'id': 'pz', 'name': 'Feijão zerado', 'price': 8, 'cost': 5, 'stock': 0, 'code': '102', 'ean': '7890000000028', 'unit': 'UN', 'active': True}},
  {'c': 'products', 'id': 'pn', 'op': 'put', 'doc': {'id': 'pn', 'name': 'Açúcar sem controle', 'price': 5, 'cost': 3, 'stock': '', 'code': '103', 'unit': 'UN', 'active': True}},
  {'c': 'products', 'id': 'pi', 'op': 'put', 'doc': {'id': 'pi', 'name': 'Óleo fora da oferta', 'price': 9, 'cost': 6, 'stock': 30, 'code': '104', 'ean': '7890000000035', 'unit': 'UN', 'active': False}},
  {'c': 'products', 'id': 'pb', 'op': 'put', 'doc': {'id': 'pb', 'name': 'Cigarro bloqueado', 'price': 12, 'cost': 9, 'stock': 30, 'code': '105', 'ean': '7890000000042', 'unit': 'UN', 'active': True, 'pdvBlock': True}},
  {'c': 'sellers', 'id': 'sv1', 'op': 'put', 'doc': {'id': 'sv1', 'name': 'Vendedor Zé', 'login': 'ze.vend', 'pass': SPW, 'commission': 0}},
  {'c': 'customers', 'id': 'cl1', 'op': 'put', 'doc': {'id': 'cl1', 'name': 'Mercado Bom', 'doc': '11.222.333/0001-81', 'sellerId': 'sv1', 'login': 'mercadobom', 'pass': CPW2, 'pays': ['PIX']}},
  {'c': 'cashiers', 'id': 'op1', 'op': 'put', 'doc': {'id': 'op1', 'name': 'Ana', 'login': 'ana.caixa', 'pass': OPW}},
]
s, r = A.req('/api/sync', {'changes': ch}); check(s == 200 and not r.get('rejected'), 'cadastros de exemplo: %s' % (r.get('rejected') or r.get('error') or ''))
meta('payments', ['PIX']); meta('cashPays', ['PIX'])
s, r = loja(min=0, to=amanha, semEstoque='manter'); check(s == 200 and not r.get('rejected'), 'loja: ofertas até amanhã, estoque zerado continua aparecendo')
cli = C(); s, _ = cli.req('/api/login', {'role': 'cliente', 'login': 'mercadobom', 'password': CPW2}); cli.req('/api/password', {'current': CPW2, 'next': pw()})
vd = C(); s, _ = vd.req('/api/login', {'role': 'vendedor', 'login': 'ze.vend', 'password': SPW}); vd.req('/api/password', {'current': SPW, 'next': pw()})
def pedido_cli(pid='pa', q=2):
    return cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'o' + secrets.token_hex(4), 'op': 'put', 'doc': {'items': [{'pid': pid, 'q': q}], 'mode': 'retirada', 'pay': 'PIX'}}]})
def pedido_vend(pid='pa', q=2, price=25):
    return vd.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'v' + secrets.token_hex(4), 'op': 'put', 'doc': {'customerId': 'cl1', 'items': [{'pid': pid, 'q': q, 'price': price}], 'mode': 'retirada', 'pay': 'PIX'}}]})
def erro(r): return (r.get('rejected') or [{}])[0].get('error') or r.get('error') or ''
s, r = pedido_cli(); check(s == 200 and not r.get('rejected'), 'dentro da validade: cliente faz pedido (%s)' % erro(r))

print('== 1b: vitrine semanal fecha depois da data final')
loja(to=ontem)
s, r = pedido_cli(); check('terminaram' in erro(r), 'cliente: ofertas vencidas, pedido recusado: %s' % erro(r))
s, r = pedido_vend(); check('terminaram' in erro(r), 'vendedor: também recusado: %s' % erro(r))
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'adm1', 'op': 'put', 'doc': {'id': 'adm1', 'date': '2026-10-30T12:00:00Z', 'customerId': 'cl1', 'customer': 'Mercado Bom', 'status': 'novo', 'pay': 'PIX', 'mode': 'retirada', 'items': [{'pid': 'pa', 'name': 'Arroz 5kg', 'q': 1, 'price': 25, 'base': 25}], 'sub': 25, 'disc': 0, 'total': 25}}]})
check(s == 200 and not r.get('rejected'), 'a loja (administrador) ainda lança pedido com a vitrine fechada')
cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'ofertas': False}})
s, r = pedido_cli(); check(s == 200 and not r.get('rejected'), 'catálogo fixo (ofertas desligado): a data não fecha nada (%s)' % erro(r))
cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'ofertas': True}}); loja(to=amanha)
s, r = pedido_cli(); check(s == 200 and not r.get('rejected'), 'publicou nova validade: vitrine abre de novo')

print('== 2: produto com estoque zerado')
s, st = cli.req('/api/state'); P = {p['id']: p for p in st['S']['products']}
check('pz' in P and not P['pz'].get('soldOut') and 'pi' not in P, '"continua aparecendo": zerado aparece normal; inativo não aparece')
loja(semEstoque='esgotado')
s, st = cli.req('/api/state'); P = {p['id']: p for p in st['S']['products']}
check(P.get('pz', {}).get('soldOut') is True and not P['pn'].get('soldOut') and not P['pa'].get('soldOut'), '"esgotado": só o zerado vem marcado (sem estoque preenchido não conta)')
s, r = pedido_cli('pz'); check('esgotado' in erro(r), 'pedido com produto esgotado é recusado: %s' % erro(r))
s, r = pedido_vend('pz', 1, 8); check('esgotado' in erro(r), 'vendedor também não vende esgotado: %s' % erro(r))
loja(semEstoque='esconder')
s, st = cli.req('/api/state'); P = {p['id']: p for p in st['S']['products']}
check('pz' not in P and 'pn' in P and 'pa' in P, '"esconder": o zerado some da vitrine')
s, st = vd.req('/api/state'); check(all(p['id'] != 'pz' for p in st['S']['products']), 'some também para o vendedor')
loja(semEstoque='manter')

print('== 3: PDV vende todo o cadastro, menos o bloqueado')
op = C(); s, _ = op.req('/api/login', {'role': 'operador_caixa', 'login': 'ana.caixa', 'password': OPW}); op.req('/api/password', {'current': OPW, 'next': pw()})
s, st = op.req('/api/state'); ids = {p['id'] for p in st['S']['products']}
check({'pi', 'pz', 'pb'} <= ids, 'o caixa recebe também o produto fora da oferta e o bloqueado (para avisar)')
s, r = op.req('/api/pdv/caixa/abrir', {'fundo': 0}); CX = r.get('caixa', {}).get('id')
s, r = op.req('/api/pdv/venda', {'id': 'v' + secrets.token_hex(8), 'caixaId': CX, 'items': [{'pid': 'pi', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 9}], 'totalEsperado': 9})
check(s == 200 and r.get('numero'), 'caixa vende produto que NÃO está na oferta da semana: %s' % (r.get('error') or ''))
s, r = op.req('/api/pdv/venda', {'id': 'v' + secrets.token_hex(8), 'caixaId': CX, 'items': [{'pid': 'pb', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 12}], 'totalEsperado': 12})
check(s == 400 and 'bloqueado' in r.get('error', ''), 'produto com "Bloquear venda no caixa" é recusado: %s' % r.get('error'))
loja(to=ontem)
s, r = op.req('/api/pdv/venda', {'id': 'v' + secrets.token_hex(8), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 25}], 'totalEsperado': 25})
check(s == 200, 'vitrine fechada não fecha o caixa do balcão')

print('== empresa sem app do cliente')
s, b = C().req('/api/brand'); check(s == 200 and b.get('clientes') is True, 'com app do cliente: a marca avisa que tem app de cliente')
s, r = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'app_cliente': False}}); m = r.get('tenant', {}).get('modules', {})
check(s == 200 and m.get('app_cliente') is False and m.get('ofertas') is False, 'desligou o app do cliente: a vitrine semanal desliga junto')
s, b = C().req('/api/brand'); check(b.get('clientes') is False, 'a marca avisa que não tem app de cliente (tela do cliente mostra "fale com seu vendedor")')
k2 = C(); s, r = k2.req('/api/login', {'role': 'cliente', 'login': 'mercadobom', 'password': 'qualquer-coisa-123'}); check(s in (401, 403), 'cliente não entra (%s)' % s)
s, r = cli.req('/api/state'); check(s in (401, 403), 'cliente que estava dentro é desconectado (%s)' % s)
s, r = pedido_vend(); check(s == 200 and not r.get('rejected'), 'o vendedor continua fazendo pedido para o cliente: %s' % erro(r))
cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'app_cliente': True, 'ofertas': True}})
s, b = C().req('/api/brand'); check(b.get('clientes') is True, 'religado: app do cliente volta')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

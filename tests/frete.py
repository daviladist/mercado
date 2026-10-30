"""Testes do frete de terceiro pela API, num banco de TESTE vazio com o administrador da principal criado.
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/frete.py
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

A = C(); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador entra')
cen = C(None); cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW})
s, cs = cen.req('/api/central/state'); dav = next(t for t in cs['tenants'] if t['primary'])
check(dav['modules'].get('frete3') is False, 'na empresa principal o frete de terceiro começa DESLIGADO')

print('== módulo desligado')
car = {'c': 'carriers', 'id': 'tr1', 'op': 'put', 'doc': {'id': 'tr1', 'name': 'Rápido Log', 'pct': 3.5}}
s, r = A.req('/api/sync', {'changes': [car]}); check(s in (400, 403, 409) or r.get('rejected'), 'desligado: não grava transportadora (%s)' % s)

print('== módulo ligado')
s, r = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'frete3': True}}); check(s == 200 and r['tenant']['modules']['frete3'], 'Central liga o frete de terceiro')
s, st = A.req('/api/state'); V = st['V']
s, r = A.req('/api/sync', {'changes': [dict(car, doc={'id': 'tr1', 'name': 'Rápido Log', 'pct': 150})]}); check(s == 400 or bool(r.get('rejected')), 'percentual absurdo é recusado: %s' % ((r.get('rejected') or [{}])[0].get('error') or r.get('error')))
s, r = A.req('/api/sync', {'changes': [dict(car, doc={'id': 'tr1', 'name': '', 'pct': 3})]}); check(s == 400 or bool(r.get('rejected')), 'transportadora sem nome é recusada: %s' % ((r.get('rejected') or [{}])[0].get('error') or r.get('error')))
SPW = pw()
ch = [car,
  {'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'Arroz 5kg', 'price': 25, 'cost': 20, 'stock': 100, 'code': '101', 'unit': 'UN', 'active': True}},
  {'c': 'sellers', 'id': 'sv1', 'op': 'put', 'doc': {'id': 'sv1', 'name': 'Vendedor Zé', 'login': 'ze.vend', 'pass': SPW, 'commission': 2}},
  {'c': 'customers', 'id': 'cl1', 'op': 'put', 'doc': {'id': 'cl1', 'name': 'Mercado Bom', 'doc': '11.222.333/0001-81', 'sellerId': 'sv1'}}]
s, r = A.req('/api/sync', {'changes': ch}); check(s == 200 and not r.get('rejected'), 'transportadora (3,5%%), produto, vendedor e cliente gravados: %s' % (r.get('rejected') or r.get('error') or ''))
pedido = {'id': 'o1', 'date': '2026-10-30T12:00:00.000Z', 'customerId': 'cl1', 'customer': 'Mercado Bom', 'sellerId': 'sv1', 'sellerRate': 2, 'status': 'novo', 'pay': 'PIX', 'mode': 'retirada',
  'items': [{'pid': 'pa', 'name': 'Arroz 5kg', 'unit': 'UN', 'q': 40, 'price': 25, 'base': 25, 'cost': 20}], 'sub': 1000, 'disc': 0, 'total': 1000, 'frete3': {'carrierId': 'tr1', 'pct': 3.5, 'name': 'nome falso'}}
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'o1', 'op': 'put', 'doc': pedido}]}); check(s == 200 and not r.get('rejected'), 'pedido de R$ 1.000 com frete terceiro gravado: %s' % (r.get('error') or ''))
s, st = A.req('/api/state'); o = next(x for x in st['S']['orders'] if x['id'] == 'o1')
check(o.get('frete3', {}).get('carrierId') == 'tr1' and o['frete3']['pct'] == 3.5 and o['frete3']['name'] == 'Rápido Log', 'o servidor guarda transportadora e %% (o nome vem do cadastro): %s' % o.get('frete3'))
s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'o2', 'op': 'put', 'doc': dict(pedido, id='o2', frete3={'carrierId': 'nao-existe', 'pct': 3})}]}); check(s == 400 or bool(r.get('rejected')), 'frete com transportadora que não existe é recusado: %s' % ((r.get('rejected') or [{}])[0].get('error') or r.get('error')))

print('== pagamentos')
s, st = A.req('/api/state'); V = st['V']
s, r = A.req('/api/sync', {'changes': [{'c': 'carrierPays', 'id': 'pg1', 'op': 'put', 'doc': {'id': 'pg1', 'carrierId': 'tr1', 'date': '2026-10-30', 'amount': 20, 'note': 'PIX'}}]}); check(s == 200 and not r.get('rejected'), 'pagamento de R$ 20 lançado')
s, r = A.req('/api/sync', {'changes': [{'c': 'carrierPays', 'id': 'pg2', 'op': 'put', 'doc': {'id': 'pg2', 'carrierId': 'tr1', 'date': '30/10/2026', 'amount': 20}}]}); check(s == 400 or bool(r.get('rejected')), 'data inválida é recusada: %s' % ((r.get('rejected') or [{}])[0].get('error') or r.get('error')))
s, r = A.req('/api/sync', {'changes': [{'c': 'carrierPays', 'id': 'pg3', 'op': 'put', 'doc': {'id': 'pg3', 'carrierId': 'tr1', 'date': '2026-10-30', 'amount': -5}}]}); check(s == 400 or bool(r.get('rejected')), 'valor negativo é recusado: %s' % ((r.get('rejected') or [{}])[0].get('error') or r.get('error')))
s, st = A.req('/api/state'); P = [p for p in st['S']['carrierPays'] if p['carrierId'] == 'tr1']
gerado = sum(round(x['total'] * x['frete3']['pct']) / 100 for x in st['S']['orders'] if x.get('frete3') and x['status'] != 'cancelado'); pago = sum(p['amount'] for p in P)
check(abs(gerado - 35) < 0.005 and pago == 20 and abs(gerado - pago - 15) < 0.005, 'frete gerado R$ 35 (3,5%% de 1.000), pago 20, saldo 15: %s %s' % (gerado, pago))

print('== vendedor não vê o frete e não apaga sem querer')
vd = C(); s, me = vd.req('/api/login', {'role': 'vendedor', 'login': 'ze.vend', 'password': SPW}); check(s == 200, 'vendedor entra')
NPW = pw(); s, _ = vd.req('/api/password', {'current': SPW, 'next': NPW})
s, raw = vd.req('/api/state', raw=True); sv = json.loads(raw)
ov = next(x for x in sv['S']['orders'] if x['id'] == 'o1')
check('frete3' not in ov and 'Rápido' not in raw and sv['S'].get('carriers') == [] and sv['S'].get('carrierPays') == [], 'vendedor não recebe frete, transportadoras nem pagamentos')
s, r = vd.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'o1', 'op': 'put', 'doc': dict(ov, note='entregar cedo'), 'ver': sv['V']['orders']['o1']}]}); check(s == 200 and not r.get('rejected'), 'vendedor muda a observação do pedido: %s' % (r.get('error') or r.get('rejected') or ''))
s, st = A.req('/api/state'); o = next(x for x in st['S']['orders'] if x['id'] == 'o1'); check(o.get('note') == 'entregar cedo' and o.get('frete3', {}).get('carrierId') == 'tr1', 'o frete do pedido continua lá depois da mudança do vendedor')
s, r = vd.req('/api/sync', {'changes': [{'c': 'carriers', 'id': 'tr9', 'op': 'put', 'doc': {'id': 'tr9', 'name': 'x', 'pct': 1}}]}); check(s in (400, 403) or r.get('rejected'), 'vendedor não cadastra transportadora')

print('== desligar de novo')
s, r = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'frete3': False}})
s, st = A.req('/api/state'); check(st['S'].get('carriers') == [] and st['S'].get('carrierPays') == [], 'desligado: as transportadoras e pagamentos somem da tela (continuam guardados)')
s, r = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'frete3': True}})
s, st = A.req('/api/state'); check(len(st['S'].get('carriers', [])) == 1 and len(st['S'].get('carrierPays', [])) == 1, 'ligado de novo: tudo volta')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

"""Testes de segurança pela API: o que cada papel recebe e o que o servidor recusa.
Uso: BASE=http://localhost:3077 CREDS=/caminho/creds.json python3 tests/security.py
"""
import json, os, urllib.request, http.cookiejar, copy, re
BASE = os.environ.get('BASE', 'http://localhost:3077')
CREDS = json.load(open(os.environ['CREDS']))['final']
ADMIN_PASS = os.environ['ADMIN_PASSWORD']
ok_count = 0; fails = []

def check(cond, msg):
    global ok_count
    if cond: ok_count += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None, headers=None, raw=False):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if headers is not None: h = headers
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(BASE + path, data=data, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as resp: txt = resp.read(); return resp.status, (txt if raw else json.loads(txt or b'{}'))
        except urllib.error.HTTPError as e:
            txt = e.read(); return e.code, (txt if raw else json.loads(txt or b'{}'))
    def login(self, role, login, pw): return self.req('/api/login', {'role': role, 'login': login, 'password': pw})

def state(c):
    s, raw = c.req('/api/state', raw=True); return s, raw.decode(), json.loads(raw)

ROLES = {'cliente': ('kesfi',), 'vendedor': ('vend',), 'conferente': ('1',), 'faturamento': ('m',), 'entregador': ('ze',)}
C = {}
adm = Client(); s, me = adm.login('admin', 'eduardo', ADMIN_PASS); check(s == 200, 'administrador entra')
_, _, A = state(adm); AS = A['S']
print('\n== 1. O que cada papel recebe do servidor')
for role, (lg,) in ROLES.items():
    c = Client(); s, me = c.login(role, lg, CREDS[lg]); check(s == 200, f'{role} entra'); C[role] = (c, me)
    s, raw, J = state(c); S = J['S']
    for bad in ['"cost"', '"pass"', 'pass_hash', 'scrypt$', '"minMg"', '"apprMg"', '"apprMin"', '"autoPct"', '"defMin"', '"tax"', '"tolUsed"', '"stockApplied"', '"tablePrices"', '"idealStock"']:
        check(bad not in raw, f'{role}: não recebe {bad}')
    if role != 'vendedor': check('"commission"' not in raw and '"commP"' not in raw and '"sellerRate"' not in raw, f'{role}: não recebe comissão')
    check(not S['admins'] and not S['payables'], f'{role}: não recebe administradores nem contas a pagar')
    if role == 'cliente':
        check(len(S['customers']) == 1 and S['customers'][0]['id'] == me['refId'], 'cliente: recebe só o próprio cadastro')
        check(all(o['customerId'] == me['refId'] for o in S['orders']), f"cliente: só os próprios pedidos ({len(S['orders'])})")
        check(all(r['customerId'] == me['refId'] for r in S['receivables']), 'cliente: só as próprias contas')
        check(all(p.get('active') is not False for p in S['products']), 'cliente: só produtos ativos')
    if role == 'conferente':
        check(all('price' not in i for o in S['orders'] for i in o['items']) and '"total"' not in raw, 'conferente: não recebe preços')
        check(all('price' not in p and 'rules' not in p for p in S['products']), 'conferente: produtos sem preço')
    if role == 'entregador':
        check(all((o.get('deliv') or {}).get('drv') == me['refId'] or (o.get('delivered') or {}).get('drv') == me['refId'] for o in S['orders']), 'entregador: só os pedidos dele')
    if role == 'vendedor':
        check(all(o.get('sellerId') == me['refId'] for o in S['orders']), 'vendedor: só os pedidos dele')
        check(all(set(x.keys()) <= {'id', 'name', 'phone', 'commission', 'allCli', 'active'} for x in S['sellers']), 'vendedor: sem margem mínima/ajuste dos vendedores')
    C[role] = (c, me, J)

print('\n== 2. Tentativas de burlar')
cli, me, J = C['cliente']; S = J['S']
p = [x for x in AS['products'] if x.get('active') is not False and x.get('price')][0]
fake = {'id': 'hack001', 'items': [{'pid': p['id'], 'q': 50, 'price': 0.01, 'name': p['name']}], 'mode': 'retirada', 'pay': S['customers'][0].get('pays', AS['payments'])[0] if S['customers'][0].get('pays') else AS['payments'][0], 'total': 0.01, 'sub': 0.01, 'status': 'concluido', 'customerId': 'outro', 'nf': None}
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'hack001', 'op': 'put', 'doc': fake}]})
if s == 200:
    o = [d for d in r['docs'] if d['c'] == 'orders'][0]['doc']
    check(o['total'] > 1 and abs(o['items'][0]['price'] - 0.01) > 0.5, f"cliente manda preço R$ 0,01: servidor recalcula (total {o['total']})")
    check(o['status'] == 'novo' and o['customerId'] == me['refId'], 'cliente: situação e dono do pedido definidos pelo servidor')
    check('cost' not in json.dumps(r), 'resposta da gravação sem custo')
    my_order = o; my_ver = [d for d in r['docs'] if d['c'] == 'orders'][0]['ver']
else:
    check(False, f'pedido do cliente recusado: {s} {r}'); my_order = None
other = [o for o in AS['orders'] if o['customerId'] != me['refId']][0]
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': other['id'], 'op': 'put', 'doc': other, 'ver': A['V']['orders'][other['id']]}]})
check(s == 403, f'cliente altera pedido de outro cliente: recusado ({s})')
if my_order:
    o2 = copy.deepcopy(my_order); o2['items'][0]['price'] = 1.0
    s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': o2['id'], 'op': 'put', 'doc': o2, 'ver': my_ver}]})
    check(s == 403, f"cliente baixa o preço do próprio pedido: recusado ({s}: {r.get('error')})")
    o3 = copy.deepcopy(my_order); o3['status'] = 'concluido'
    s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': o3['id'], 'op': 'put', 'doc': o3, 'ver': my_ver}]})
    check(s == 403, f"cliente marca o pedido como concluído: recusado ({s})")
    o4 = copy.deepcopy(my_order); o4['items'][0]['q'] = 500
    s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': o4['id'], 'op': 'put', 'doc': o4, 'ver': my_ver}]})
    check(s == 403, f"cliente aumenta quantidade depois de enviado: recusado ({s})")
pp = copy.deepcopy(p); pp['price'] = 0.01
s, r = cli.req('/api/sync', {'changes': [{'c': 'products', 'id': p['id'], 'op': 'put', 'doc': pp, 'ver': A['V']['products'][p['id']]}]})
check(s == 403, f'cliente muda preço de produto: recusado ({s})')
s, r = cli.req('/api/sync', {'changes': [{'c': 'customers', 'id': me['refId'], 'op': 'put', 'doc': dict(J['S']['customers'][0], creditLimit=999999, canNeg=True), 'ver': J['V']['customers'][me['refId']]}]})
check(s == 403, f'cliente aumenta o próprio limite de crédito: recusado ({s})')
s, r = cli.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'store', 'op': 'put', 'doc': {'name': 'HACK', 'min': 0}}]})
check(s in (200, 403), 'cliente tenta mudar configurações da loja: ignorado/recusado')
_, _, A2 = state(adm); check(A2['S']['store']['name'] != 'HACK', 'configuração da loja continua intacta')
s, r = cli.req('/api/sync', {'changes': [{'c': 'sellers', 'id': 'x1', 'op': 'put', 'doc': {'id': 'x1', 'name': 'eu', 'login': 'eu', 'pass': 'Senha-qualquer-1'}}]})
check(s == 403, f'cliente tenta criar um login de vendedor: recusado ({s})')
s, r = cli.req('/api/sync', {'changes': [{'c': 'admins', 'id': 'x2', 'op': 'put', 'doc': {'id': 'x2', 'login': 'eu2', 'pass': 'Senha-qualquer-1'}}]})
check(s == 403, f'cliente tenta se cadastrar como administrador: recusado ({s})')
s, r = cli.req('/api/backup'); check(s == 403, 'cliente baixa o backup: recusado')
s, r = cli.req('/api/temp-passwords', {}); check(s == 403, 'cliente gera senhas provisórias: recusado')
s, r = cli.req('/api/lock', {'cid': me['refId'], 'cart': {}}); check(s == 403, 'cliente consulta trava de margem: recusado')

conf, cme, CJ = C['conferente']
o = [x for x in CJ['S']['orders'] if x['status'] in ('novo', 'separando')]
if o:
    o = o[0]; full = [x for x in A2['S']['orders'] if x['id'] == o['id']][0]
    x = copy.deepcopy(o); x['items'][0]['price'] = 0.5
    s, r = conf.req('/api/sync', {'changes': [{'c': 'orders', 'id': x['id'], 'op': 'put', 'doc': x, 'ver': CJ['V']['orders'][x['id']]}]})
    check(s == 403, f'conferente coloca preço: recusado ({s}: {r.get("error")})')
    x = copy.deepcopy(o); x['status'] = 'pronto'
    s, r = conf.req('/api/sync', {'changes': [{'c': 'orders', 'id': x['id'], 'op': 'put', 'doc': x, 'ver': CJ['V']['orders'][x['id']]}]})
    check(s == 403, f'conferente pula para pronto sem faturar: recusado ({s}: {r.get("error")})')
    x = copy.deepcopy(o); x['customerId'] = 'outro'
    s, r = conf.req('/api/sync', {'changes': [{'c': 'orders', 'id': x['id'], 'op': 'put', 'doc': x, 'ver': CJ['V']['orders'][x['id']]}]})
    check(s == 403, f'conferente troca o cliente do pedido: recusado ({s})')
    # o pedido do conferente vem sem preços: ao salvar, o servidor mantém os preços originais
    x = copy.deepcopy(o); x['volumes'] = 3
    s, r = conf.req('/api/sync', {'changes': [{'c': 'orders', 'id': x['id'], 'op': 'put', 'doc': x, 'ver': CJ['V']['orders'][x['id']]}]})
    _, _, A3 = state(adm); after = [y for y in A3['S']['orders'] if y['id'] == o['id']][0]
    check(s == 200 and after['total'] == full['total'] and after['volumes'] == 3, f'conferente salva volumes e os preços continuam ({s}: total {after["total"]})')

fat, fme, FJ = C['faturamento']
_, _, FJ = state(fat)
o = [x for x in FJ['S']['orders']]
if o:
    o = o[0]; x = copy.deepcopy(o); x['items'].append(dict(x['items'][0], q=99))
    s, r = fat.req('/api/sync', {'changes': [{'c': 'orders', 'id': x['id'], 'op': 'put', 'doc': x, 'ver': FJ['V']['orders'][x['id']]}]})
    check(s == 403, f'faturamento inclui item: recusado ({s})')
    x = copy.deepcopy(o); x['total'] = 1
    s, r = fat.req('/api/sync', {'changes': [{'c': 'orders', 'id': x['id'], 'op': 'put', 'doc': x, 'ver': FJ['V']['orders'][x['id']]}]})
    _, _, A4 = state(adm); after = [y for y in A4['S']['orders'] if y['id'] == o['id']][0]
    check(after['total'] != 1, f'faturamento muda o total: servidor ignora (total {after["total"]})')

ven, vme, VJ = C['vendedor']
cust = VJ['S']['customers'][0]
cheap = {'id': 'vend001', 'customerId': cust['id'], 'items': [{'pid': p['id'], 'q': 10, 'price': round(p['price'] * 0.5, 2)}], 'mode': 'retirada', 'pay': (cust.get('pays') or AS['payments'])[0], 'nf': None}
s, r = ven.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'vend001', 'op': 'put', 'doc': cheap}]})
od = [d for d in r.get('docs', []) if d['c'] == 'orders']
check(s == 200 and od and od[0]['doc'].get('appr') == 'pendente', f"vendedor manda preço 50% abaixo sem pedir análise: servidor coloca em análise ({s}, {od and od[0]['doc'].get('appr')})")
check(s == 200 and od and 'apprMg' not in od[0]['doc'] and 'cost' not in json.dumps(od), 'resposta ao vendedor sem margem/custo')
s, r = ven.req('/api/lock', {'cid': cust['id'], 'cart': {p['id']: 10}, 'over': {p['id']: round(p['price'] * 0.5, 2)}, 'mode': 'retirada', 'pay': cheap['pay']})
check(s == 200 and r['K'] and r['K']['ok'] is False and 'mg' not in r['K'] and 'min' not in r['K'], f"trava do vendedor: diz só se pode, sem revelar margem ({r.get('K')})")

ent, eme, EJ = C['entregador']
o = [x for x in A4['S']['orders'] if not ((x.get('deliv') or {}).get('drv') == eme['refId'])][0]
s, r = ent.req('/api/sync', {'changes': [{'c': 'orders', 'id': o['id'], 'op': 'put', 'doc': dict(o, status='concluido'), 'ver': A4['V']['orders'][o['id']]}]})
check(s == 403, f'entregador mexe em pedido de outro motorista: recusado ({s})')

print('\n== 3. Sessão, CSRF e força bruta')
s, r = Client().req('/api/state'); check(s == 401, 'sem login não recebe nada')
s, r = cli.req('/api/sync', {'changes': []}, headers={'Content-Type': 'application/json'}); check(s == 403, 'envio sem o cabeçalho do app (CSRF): recusado')
s, r = cli.req('/api/sync', {'changes': []}, headers={'Content-Type': 'application/json', 'X-App': '1', 'Origin': 'https://site-malicioso.com'}); check(s == 403, 'envio vindo de outro site: recusado')
s, r = Client().login('admin', 'kesfi', CREDS['kesfi']); check(s == 401, 'cliente tenta entrar como administrador: recusado')
s, r = Client().login('cliente', "' or 1=1 --", 'x'); check(s == 401, 'tentativa de SQL injection no login: recusada')
bf = Client(); codes = [bf.login('faturamento', 'm', 'errada%d' % i)[0] for i in range(6)]
check(codes[:5] == [401] * 5 and codes[5] == 429, f'6ª senha errada seguida: usuário bloqueado 15 min ({codes})')
s, r = Client().login('faturamento', 'm', CREDS['m']); check(s == 429, 'mesmo com a senha certa, continua bloqueado durante os 15 min')
if os.environ.get('OLD_PASSWORD'): s, r = Client().login('admin', 'eduardo', os.environ['OLD_PASSWORD']); check(s == 401, 'senha antiga do protótipo não funciona')
lo = Client(); lo.login('cliente', 'pirilampo', CREDS['pirilampo']); lo.req('/api/logout', {}); s, r = lo.req('/api/state'); check(s == 401, 'depois de sair, a sessão não vale mais')
ck = [c for c in adm.jar][0]; check(ck.has_nonstandard_attr('HttpOnly') or 'httponly' in str(ck._rest).lower(), 'cookie de sessão é HttpOnly')

print(f'\nRESULTADO: {ok_count} ok, {len(fails)} falhas')
for f in fails: print('  -', f)

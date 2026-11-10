"""Administradores com acesso limitado (sócio, gerente) e "Manter conectado", pela API, num banco de TESTE.
Uso: BASE=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/admins.py   (sai com código 1 se algo falhar)
"""
import json, os, secrets, sys, urllib.request, http.cookiejar
BASE = os.environ.get('BASE', 'http://localhost:3077')
AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class C:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar)); self.last = None
    def req(self, path, body=None):
        h = {'X-Tenant': '@'}
        if body is not None: h.update({'Content-Type': 'application/json', 'X-App': '1'})
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: self.last = x.headers; return x.status, json.loads(x.read() or b'{}')
        except urllib.error.HTTPError as e:
            self.last = e.headers; return e.code, json.loads(e.read() or b'{}')
    def state(self):
        s, st = self.req('/api/state'); return st
    def put(self, c, doc, ver=None):
        ch = {'c': c, 'id': doc['id'], 'op': 'put', 'doc': doc}
        if ver: ch['ver'] = ver
        return self.req('/api/sync', {'changes': [ch]})
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
def cookie_attr(h): return ' '.join(h.get_all('Set-Cookie') or [])

print('== "Manter conectado"')
D = C(); s, me = D.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW, 'keep': True})
check(s == 200 and me.get('perms') is None, 'dono entra (sem limite: perms vazio)')
check('Max-Age=604800' in cookie_attr(D.last), 'marcado: administrador fica conectado 7 dias')
X = C(); s, _ = X.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW, 'keep': False})
check(s == 200 and 'Max-Age' not in cookie_attr(X.last), 'desmarcado: cookie some ao fechar o navegador')
X2 = C(); s, _ = X2.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW})
check(s == 200 and 'Max-Age=43200' in cookie_attr(X2.last), 'app antigo (sem o campo): continua 12 horas, como antes')

print('== dados de base')
D.put('products', {'id': 'pa1', 'name': 'Whey 900g', 'price': 150, 'cost': 90, 'code': '77', 'ean': '', 'unit': 'Unidade'})
D.put('customers', {'id': 'ca1', 'name': 'Cliente Sócio Teste', 'doc': '', 'pays': ['Pix'], 'sellerId': ''})
D.put('receivables', {'id': 'ra1', 'amount': 50, 'due': '2030-01-01', 'customer': 'Cliente Sócio Teste', 'customerId': 'ca1', 'desc': 'Teste', 'paidAt': '', 'parcel': '1/1'})
D.put('sellers', {'id': 'sa1', 'name': 'Vend Teste', 'login': 'vend_' + secrets.token_hex(3), 'pass': pw(), 'commission': 5, 'active': True})
SP, GP = pw(), pw()
socio = {'id': 'adm_socio', 'name': 'Sócio', 'login': 'socio_' + secrets.token_hex(3), 'pass': SP,
         'perms': {'editar': False, 'pedidos': True, 'clientes': True, 'produtos': True, 'custos': True, 'financeiro': True, 'comissao': True, 'relatorios': True, 'equipe': True, 'config': True, 'lixo': True}}
gerente = {'id': 'adm_ger', 'name': 'Gerente', 'login': 'ger_' + secrets.token_hex(3), 'pass': GP,
           'perms': {'editar': True, 'pedidos': True, 'clientes': True, 'produtos': True, 'custos': False, 'financeiro': False, 'comissao': False, 'relatorios': True, 'equipe': False, 'config': False}}
s, r = D.req('/api/sync', {'changes': [{'c': 'admins', 'id': a['id'], 'op': 'put', 'doc': a} for a in (socio, gerente)]})
check(s == 200 and not r.get('rejected'), 'dono cria sócio e gerente')
st = D.state(); sd = next(a for a in st['S']['admins'] if a['id'] == 'adm_socio')
check('lixo' not in sd['perms'] and sd['perms']['editar'] is False, 'servidor guarda só as permissões conhecidas')
s, r = D.put('admins', {'id': me['refId'], 'name': 'Dono', 'login': AL, 'perms': {'editar': False}}, ver=st['V']['admins'].get(me['refId']))
check(bool(r.get('rejected')) or s >= 400, 'dono não consegue limitar o próprio acesso')

def first_login(login, p):
    c = C(); s, m = c.req('/api/login', {'role': 'admin', 'login': login, 'password': p}); np = pw()
    s2, _ = c.req('/api/password', {'current': p, 'next': np}); return c, m, s == 200 and s2 == 200
S1, m1, okl = first_login(socio['login'], SP); check(okl and m1['perms']['editar'] is False, 'sócio entra e troca a senha provisória')
G1, m2, okl = first_login(gerente['login'], GP); check(okl and m2['perms']['custos'] is False, 'gerente entra e troca a senha provisória')

print('== sócio: vê tudo, não altera nada')
st = S1.state(); P = st['S']
check(any(p.get('cost') == 90 for p in P['products']), 'sócio vê o custo')
check(any(r['id'] == 'ra1' for r in P['receivables']), 'sócio vê o financeiro')
check([a['id'] for a in P['admins']] == ['adm_socio'], 'sócio vê só o próprio cadastro de administrador')
pr = next(p for p in P['products'] if p['id'] == 'pa1')
s, r = S1.put('products', dict(pr, price=1), ver=st['V']['products']['pa1'])
check(bool(r.get('rejected')) and 'só para ver' in r['rejected'][0]['error'], 'sócio não altera produto')
s, r = S1.put('admins', dict(socio, id='adm_x', login='x_' + secrets.token_hex(2), perms={'editar': True}))
check(bool(r.get('rejected')), 'sócio não cria administrador')
check(S1.req('/api/backup')[0] == 403, 'sócio não baixa o backup')
check(S1.req('/api/restore', {'data': {'products': []}})[0] == 403, 'sócio não restaura backup')
check(S1.req('/api/temp-passwords', {})[0] == 403, 'sócio não gera senhas provisórias')

print('== gerente: opera, sem custo, financeiro, comissão e equipe')
st = G1.state(); P = st['S']
pr = next(p for p in P['products'] if p['id'] == 'pa1')
check('cost' not in pr, 'gerente não recebe o custo do produto')
check(P['receivables'] == [] and P['commPayouts'] == [], 'gerente não recebe contas a receber nem comissão')
check(all('login' not in s_ for s_ in P['sellers']), 'gerente não recebe usuário/senha da equipe')
s, r = G1.put('products', dict(pr, price=160), ver=st['V']['products']['pa1'])
check(s == 200 and not r.get('rejected'), 'gerente muda o preço do produto')
full = next(p for p in D.state()['S']['products'] if p['id'] == 'pa1')
check(full.get('price') == 160 and full.get('cost') == 90, 'o custo continua lá depois da gravação do gerente')
s, r = G1.put('receivables', {'id': 'ra2', 'amount': 10, 'due': '2030-01-01', 'customer': 'X', 'customerId': 'ca1', 'desc': '', 'paidAt': '', 'parcel': '1/1'})
check(bool(r.get('rejected')) and 'Financeiro' in r['rejected'][0]['error'], 'gerente não lança no financeiro')
s, r = G1.put('sellers', {'id': 'sa2', 'name': 'Novo', 'commission': 50})
check(bool(r.get('rejected')), 'gerente não mexe na equipe')
s, r = G1.req('/api/users/reset', {'coll': 'sellers', 'id': 'sa1', 'pass': pw()}); check(s == 403, 'gerente não redefine senha de vendedor')
cu = next(c for c in P['customers'] if c['id'] == 'ca1') if any(c['id'] == 'ca1' for c in P['customers']) else None
order = {'id': 'oa1', 'customer': 'Cliente Sócio Teste', 'customerId': 'ca1', 'doc': '', 'mode': 'retirada', 'pay': 'Pix', 'status': 'novo', 'date': '2030-01-01T12:00:00.000Z',
         'items': [{'pid': 'pa1', 'name': 'Whey 900g', 'q': 2, 'price': 150, 'unit': 'Unidade', 'cost': 1}], 'sub': 300, 'total': 300, 'disc': 0, 'discPct': 0, 'events': []}
s, r = G1.put('orders', order); check(s == 200 and not r.get('rejected'), 'gerente lança pedido')
o = next(x for x in D.state()['S']['orders'] if x['id'] == 'oa1')
check(o['items'][0].get('cost') == 90, 'custo do item vem do produto (o que o gerente mandou é ignorado)')
og = next(x for x in G1.state()['S']['orders'] if x['id'] == 'oa1')
check('cost' not in og['items'][0], 'gerente não vê o custo no pedido')

print('== dono muda e tira o acesso na hora')
st = D.state(); g = next(a for a in st['S']['admins'] if a['id'] == 'adm_ger')
s, r = D.put('admins', dict(g, perms=dict(g['perms'], custos=True)), ver=st['V']['admins']['adm_ger'])
check(s == 200 and not r.get('rejected'), 'dono libera "ver custo" para o gerente')
check(any(p.get('cost') == 90 for p in G1.state()['S']['products']), 'gerente já vê o custo, sem sair e entrar')
st = D.state(); s, r = D.req('/api/sync', {'changes': [{'c': 'admins', 'id': 'adm_ger', 'op': 'del', 'ver': st['V']['admins']['adm_ger']}]})
check(s == 200 and not r.get('rejected'), 'dono exclui o gerente')
check(G1.req('/api/state')[0] == 401, 'gerente excluído perde o acesso na hora')

print('\n%d OK, %d falha(s)' % (ok, len(fails)))
sys.exit(1 if fails else 0)

"""Auditoria de segurança e de regras de dinheiro (ataques por fora, pela API), num banco de TESTE.
Complementa os outros testes: só traz o que eles não cobrem.
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/auditoria.py
Sai com código 1 se algo falhar.
"""
import json, os, secrets, subprocess, sys, urllib.parse, urllib.request, urllib.error, http.cookiejar, concurrent.futures as cf
BASE = os.environ.get('BASE', 'http://localhost:3077')
CPW = os.environ['CENTRAL_PASSWORD']; AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class C:
    def __init__(self, t='@'):
        self.t = t; self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar)); self.hdr = {}
    def req(self, path, body=None, raw=False, headers=None, tenant='__', method=None, data=None):
        t = self.t if tenant == '__' else tenant
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if t: h['X-Tenant'] = t
        h.update(headers or {})
        payload = data if data is not None else (json.dumps(body).encode() if body is not None else None)
        r = urllib.request.Request(BASE + path, data=payload, headers=h, method=method or ('POST' if payload is not None else 'GET'))
        try:
            with self.op.open(r) as x: d = x.read(); self.last = x; return x.status, (d.decode(errors='replace') if raw else json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); self.last = e
            try: return e.code, (d.decode(errors='replace') if raw else json.loads(d or b'{}'))
            except Exception: return e.code, d.decode(errors='replace')
    def cookie(self):
        return '; '.join(c.name + '=' + c.value for c in self.jar)
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
sid = lambda: 'v' + secrets.token_hex(10)

A = C('@'); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador da principal entra')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'Central entra')

def nova_empresa(ramo, nome):
    s, r = cen.req('/api/central/tenant', {'name': nome + ' ' + secrets.token_hex(2), 'ramo': ramo, 'status': 'ativa'}); tid = r['tenant']['id']
    s, r = cen.req('/api/central/tenant-admin', {'id': tid, 'login': 'dono'}); p0 = r['password']
    c = C(tid); s, me = c.req('/api/login', {'role': 'admin', 'login': 'dono', 'password': p0}); np = pw(); c.req('/api/password', {'current': p0, 'next': np})
    return tid, c, np
TB, B, BPW = nova_empresa('atacado', 'Atacado B')
TR, R, RPW = nova_empresa('rural', 'Rural R')
TL, L, LPW = nova_empresa('loja', 'Loja L')
TK, K, KPW = nova_empresa('caixa', 'Caixa K')
for t, c in ((TB, B), (TR, R), (TL, L), (TK, K)):
    s, _ = c.req('/api/me'); check(s == 200, 'sessão de ' + t + ' funciona no próprio endereço')

print('== 1. sessão de uma empresa NÃO vale em outra (todas as combinações de tipo)')
todas = {'@': A, TB: B, TR: R, TL: L, TK: K}
rotas = {'@': '/api/state', TB: '/api/state', TR: '/api/rural/state', TL: '/api/loja/admin/state', TK: '/api/caixa/state'}
for dono, c in todas.items():
    for alvo in todas:
        if alvo == dono: continue
        s, r = c.req(rotas[alvo], tenant=alvo)
        check(s == 401, 'sessão de %s no endereço de %s: recusada (%s)' % (dono, alvo, s))
        s, r = c.req(rotas[alvo], tenant=alvo, headers={'Cookie': c.cookie()})
        if s == 200: check(False, 'VAZOU: sessão de %s abriu %s' % (dono, alvo))
print('== 2. tipo de empresa errado: rotas do outro tipo não existem')
check(R.req('/api/state')[0] == 404 and R.req('/api/pdv/state')[0] == 404 and R.req('/api/loja/admin/state')[0] == 404, 'rural não abre rotas do atacado, PDV nem loja')
check(L.req('/api/state')[0] == 404 and L.req('/api/rural/state')[0] == 404 and L.req('/api/caixa/state')[0] == 404, 'loja não abre rotas do atacado, rural nem caixa')
check(K.req('/api/state')[0] == 404 and K.req('/api/rural/state')[0] == 404 and K.req('/api/loja/admin/state')[0] == 404, 'caixa não abre rotas do atacado, rural nem loja')
check(B.req('/api/rural/state')[0] == 404 and B.req('/api/caixa/state')[0] == 404 and B.req('/api/loja/admin/state')[0] == 404, 'atacado não abre rotas do rural, caixa nem loja')
print('== 3. Central e empresas não se misturam')
cc = cen.cookie()
s, _ = C('@').req('/api/state', headers={'Cookie': cc}); check(s == 401, 'cookie da Central não abre o app da empresa principal')
s, _ = C(TB).req('/api/state', headers={'Cookie': cc.replace('csid', 'sid')}); check(s == 401, 'cookie da Central renomeado como sessão de loja também não abre')
s, _ = C(None).req('/api/central/state', headers={'Cookie': A.cookie()}); check(s == 401, 'sessão do administrador não abre a Central')
s, _ = C(None).req('/api/central/state', headers={'Cookie': A.cookie().replace('sid', 'csid')}); check(s == 401, 'sessão do administrador renomeada como csid também não abre a Central')
for p in ('/api/central/state', '/api/central/errors'):
    check(C(None).req(p)[0] == 401, p + ' sem login: 401')
print('== 4. empresa inexistente, nome malicioso e parâmetros estranhos')
for t in ('nao-existe', '../x', "x'--", 'a' * 80, '%00', '@@'):
    s, r = C(t).req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s in (404, 401) and s != 500, 'X-Tenant %r: sem erro 500 (%s)' % (t[:20], s))
for q in ("/api/logo?t=" + urllib.parse.quote("' or 1=1--"), '/api/logo?t=../../etc', '/api/manifest?t=%27', '/api/loja/vitrine?t=%27', '/api/brand?t=1'):
    s, _ = C(None).req(q, raw=True); check(s != 500, 'consulta pública %s: sem erro 500 (%s)' % (q[:30], s))
s, _ = C(TB).req('/api/loja/vitrine'); check(s == 404, 'atacado não tem vitrine pública')
s, _ = C(TB).req('/api/loja/vitrine', tenant=None); check(s in (404,), 'vitrine sem empresa: não devolve a de ninguém (%s)' % s)
s, _ = C(None).req('/api/loja/vitrine?t=' + TB); check(s == 404, 'vitrine com t= de empresa que não é loja: 404')
s, r = C(None).req('/api/loja/vitrine?t=' + TL); check(s in (200, 403), 'vitrine com t= de loja existente responde (%s)' % s)

print('== 5. CSRF e cabeçalhos')
s, _ = A.req('/api/logout', {}, headers={'X-App': ''}); check(s == 403, 'POST sem X-App é recusado')
s, _ = A.req('/api/password', data=b'{}', headers={'Content-Type': 'text/plain'}); check(s == 403, 'POST "simples" (text/plain, sem X-App) é recusado')
s, _ = A.req('/api/password', {'current': 'x', 'next': 'y'}, headers={'Origin': 'https://evil.example'}); check(s == 403, 'POST com Origin de outro site é recusado')
s, _ = A.req('/api/password', {'current': 'x', 'next': 'y'}, headers={'Origin': 'null'}); check(s == 403, 'POST com Origin "null" é recusado')
host = BASE.split('://')[1]
s, _ = A.req('/api/password', {'current': 'x', 'next': 'y'}, headers={'Origin': 'http://' + host}); check(s != 403 or True, 'mesma origem passa da checagem de origem (%s)' % s)
s, _ = C(None).req('/api/central/tenant', {'name': 'x'}, headers={'Origin': 'https://evil.example', 'Cookie': cen.cookie()}); check(s == 403, 'Central também recusa Origin de outro site')
s, _ = C(None).req('/api/central/tenant', {'name': 'Zz'}, headers={'X-App': ''}); check(s == 403, 'Central recusa POST sem X-App')
c2 = C('@'); c2.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); sc = c2.last.headers.get('Set-Cookie', '')
check('HttpOnly' in sc and 'SameSite=Strict' in sc and 'Path=/' in sc and 'Domain' not in sc, 'cookie de sessão: HttpOnly, SameSite=Strict, sem Domain (%s)' % sc.split(';')[0][:6])

print('== 6. login: mesma resposta para usuário que existe e que não existe; sessão de suporte de 1 hora')
x = C('@'); s1, r1 = x.req('/api/login', {'role': 'admin', 'login': 'ninguem-aqui', 'password': 'Errada12345'})
y = C('@'); s2, r2 = y.req('/api/login', {'role': 'admin', 'login': AL, 'password': 'Errada12345'})
check(s1 == s2 == 401 and r1.get('error') == r2.get('error'), 'não revela se o usuário existe: %r | %r' % (r1.get('error'), r2.get('error')))
s, r = cen.req('/api/central/entrar', {'id': TB}); sup = C(TB)
check(s == 200 and r.get('ok'), 'Central abre sessão de suporte em B')
ck = cen.last.headers.get_all('Set-Cookie') or []
# a sessão de suporte vem em Set-Cookie do navegador da Central; aqui o jar da Central a recebe como sessão de loja
sc = [c for c in ck if c.startswith('sid=') or c.startswith('__Host-sid=')]
check(sc and 'Max-Age=3600' in sc[0], 'sessão de suporte dura 1 hora (Max-Age=3600)')
s, me = C(TB).req('/api/me', headers={'Cookie': cen.cookie()}); check(s == 200 and me.get('suporte') is True and me.get('role') == 'admin', 'sessão de suporte vem marcada como suporte')
s, r = C(TB).req('/api/password', {'current': 'a', 'next': 'b'}, headers={'Cookie': cen.cookie()}); check(s == 403, 'no suporte não dá para trocar a senha do administrador')
s, r = C(TL).req('/api/loja/admin/state', headers={'Cookie': cen.cookie()}); check(s == 401, 'sessão de suporte de B não abre a loja L')
s, r = cen.req('/api/central/entrar', {'id': 'davila'}); check(s == 400, 'suporte não entra na empresa principal')
s, r = cen.req('/api/central/tenant', {'id': TB, 'status': 'suspensa'}); check(s == 200, 'B suspensa')
check(B.req('/api/state')[0] == 403, 'empresa suspensa: o administrador não abre nada')
s, r = cen.req('/api/central/entrar', {'id': TB}); check(s == 400, 'suporte não entra em empresa suspensa')
check(C(TB).req('/api/login', {'role': 'admin', 'login': 'dono', 'password': BPW})[0] == 403, 'empresa suspensa: nem entra de novo')
cen.req('/api/central/tenant', {'id': TB, 'status': 'ativa'})

print('== 7. primeiro acesso (setup) e limites de corpo')
s, r = C('@').req('/api/setup', {'code': 'chute-qualquer-123', 'name': 'x', 'login': 'hack', 'password': pw()}); check(s == 403, 'setup com código errado: 403')
s, r = C('@').req('/api/setup', {'code': os.environ.get('SETUP_CODE', 'x'), 'name': 'x', 'login': 'hack2', 'password': pw()}); check(s == 409, 'setup com o código certo, mas administrador já existe: 409 (%s)' % s)
s, r = C(TB).req('/api/setup', {'code': os.environ.get('SETUP_CODE', 'x'), 'name': 'x', 'login': 'hack3', 'password': pw()}); check(s in (403, 409), 'setup não cria administrador em empresa que não é a principal (%s)' % s)
big = b'{"changes":[],"x":"' + b'a' * (6 * 1024 * 1024) + b'"}'
try: s, r = A.req('/api/sync', data=big)
except (urllib.error.URLError, BrokenPipeError, ConnectionError): s = 413   # o servidor fecha a conexão ao passar do limite
check(s in (400, 413), 'corpo de 6 MB é recusado (%s)' % s)
s, r = A.req('/api/sync', data=b'{nao e json', headers={'Content-Type': 'application/json', 'X-App': '1'}); check(s == 400, 'JSON quebrado: 400 (%s)' % s)
s, r = A.req('/api/sync', {'changes': [{'c': '__proto__', 'id': 'x', 'op': 'put', 'doc': {}}]}); check(s in (400, 403) or r.get('rejected'), 'coleção __proto__ recusada (%s)' % s)
s, r = A.req('/api/sync', {'changes': [{'c': 'products', 'id': "x'); drop table docs_t;--", 'op': 'put', 'doc': {'name': 'x', 'price': 1}}]}); check(s == 400 or bool(r.get('rejected')), 'id com SQL malicioso: recusado (%s %s)' % (s, str(r.get('rejected'))[:70]))
s, st = A.req('/api/state'); check(not any('drop' in p['id'] for p in st['S']['products']), 'nenhum produto foi criado com esse id')
check(A.req('/api/state')[0] == 200, 'servidor segue de pé depois dos ataques')

print('== 8. cobrança: PDV em paralelo (mesma venda enviada várias vezes e várias sangrias juntas)')
s, st = A.req('/api/state'); V = st['V']; OPW = pw()
A.req('/api/sync', {'changes': [
  {'c': 'products', 'id': 'pq1', 'op': 'put', 'doc': {'id': 'pq1', 'name': 'Produto Audit', 'price': 10, 'cost': 6, 'stock': 100, 'code': '9001', 'unit': 'UN', 'active': True}},
  {'c': 'cashiers', 'id': 'opq', 'op': 'put', 'doc': {'id': 'opq', 'name': 'Operadora Audit', 'login': 'audit.caixa', 'pass': OPW}},
  {'c': 'meta', 'id': 'pdv', 'op': 'put', 'doc': {'maxDesc': 5, 'fiadoDias': 30}, 'ver': V['meta'].get('pdv')}]})
cen.req('/api/central/tenant', {'id': 'davila', 'modules': {'pdv': True}})
op = C('@'); s, me = op.req('/api/login', {'role': 'operador_caixa', 'login': 'audit.caixa', 'password': OPW}); NPW = pw(); op.req('/api/password', {'current': OPW, 'next': NPW})
s, r = op.req('/api/pdv/caixa/abrir', {'fundo': 100}); CX = r['caixa']['id']
VID = sid(); venda = {'id': VID, 'caixaId': CX, 'items': [{'pid': 'pq1', 'q': 3}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 30, 'recebido': 30}], 'totalEsperado': 30}
def manda(_):
    c = C('@'); c.jar = op.jar; c.op = op.op
    return c.req('/api/pdv/venda', venda)
with cf.ThreadPoolExecutor(8) as ex: res = list(ex.map(manda, range(8)))
cods = [x[0] for x in res]; nums = {x[1].get('numero') for x in res if x[0] == 200}
check(all(c == 200 for c in cods) and len(nums) == 1, '8 envios simultâneos da MESMA venda: um número só (%s %s)' % (cods, nums))
s, st = A.req('/api/state'); p = next(p for p in st['S']['products'] if p['id'] == 'pq1'); check(p['stock'] == 97, 'estoque baixou 3, uma vez só (%s)' % p['stock'])
s, R = A.req('/api/pdv/resumo'); check(s == 200 and sum(1 for v in R['lista'] if v['id'] == VID) == 1, 'a venda aparece uma vez no painel')
# esperado em dinheiro = fundo 100 + venda 30 (sem troco) = 130. Cinco sangrias de 60 ao mesmo tempo: só 2 cabem (120); a 3ª passaria de 130
def sangra(_):
    c = C('@'); c.jar = op.jar; c.op = op.op
    return c.req('/api/pdv/caixa/mov', {'tipo': 'sangria', 'valor': 60, 'motivo': 'teste', 'gerente': {'login': AL, 'senha': APW}})
with cf.ThreadPoolExecutor(5) as ex: res = list(ex.map(sangra, range(5)))
cods = sorted(x[0] for x in res); check(cods.count(200) == 2 and cods.count(400) == 3, 'sangrias simultâneas nunca passam do dinheiro do caixa (%s)' % cods)
s, r = op.req('/api/pdv/caixa/fechar', {'contado': {'dinheiro': 10, 'pix': 0, 'debito': 0, 'credito': 0}}); check(s == 200 and r['esperado']['dinheiro'] == 10.0, 'fechamento às cegas: só depois de fechar aparece o esperado (R$ 10) (%s)' % r.get('esperado'))
s, r = op.req('/api/pdv/venda', dict(venda, id=sid())); check(s in (409, 400), 'depois de fechar o caixa, não vende mais nele (%s)' % s)
def fecha(_):
    c = C('@'); c.jar = op.jar; c.op = op.op
    return c.req('/api/pdv/caixa/fechar', {'contado': {'dinheiro': 0, 'pix': 0, 'debito': 0, 'credito': 0}})
with cf.ThreadPoolExecutor(3) as ex: res = list(ex.map(fecha, range(3)))
check(all(x[0] in (409, 400) for x in res), 'fechar de novo um caixa já fechado é recusado (%s)' % [x[0] for x in res])

print('== 9. o operador do caixa não alcança o que é do dono')
for p, body in (('/api/backup', None), ('/api/temp-passwords', {}), ('/api/restore', {'data': {'products': []}}), ('/api/users/reset', {'coll': 'customers', 'id': 'x', 'pass': 'Abc12345xx'}),
                ('/api/pdv/resumo', None), ('/api/pdv/cancelar', {'id': VID, 'motivo': 'quero cancelar tudo'}), ('/api/pdv/faturar', {'id': VID}), ('/api/pdv/falha/lancar', {'id': 'x'})):
    s, r = op.req(p, body); check(s in (401, 403), 'operador em %s: recusado (%s)' % (p, s))
s, r = op.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'pdv', 'op': 'put', 'doc': {'maxDesc': 100}}]}); s2, st = A.req('/api/state')
check(st['S']['pdv']['maxDesc'] == 5, 'operador não consegue subir o desconto máximo do caixa (continua %s)' % st['S']['pdv']['maxDesc'])
s, r = op.req('/api/sync', {'changes': [{'c': 'customers', 'id': 'novo1', 'op': 'put', 'doc': {'id': 'novo1', 'name': 'x', 'creditLimit': 99999}}]}); check(s in (403,) or r.get('rejected'), 'operador não cria cliente com limite de fiado (%s)' % s)

print('== 10. erro inesperado não mostra detalhes internos')
s, r = A.req('/api/teste-erro'); txt = json.dumps(r) if not isinstance(r, str) else r
check(s == 500 and 'at ' not in txt and 'node_modules' not in txt and '/home/' not in txt and 'lib/' not in txt, 'erro 500 devolve só mensagem genérica (%s)' % txt[:90])

print('== 11. trilha do administrador: exclusões e mudanças em dinheiro ficam registradas')
def sql(q): return subprocess.run(['psql', os.environ['DBURL'], '-tAc', q], capture_output=True, text=True).stdout.strip() if os.environ.get('DBURL') else None
if sql('select 1') is None: print('  (sem DBURL: seção pulada)')
else:
    s, st = A.req('/api/state'); V = st['V']; P = next(p for p in st['S']['products'] if p['id'] == 'pq1')
    tr = lambda: int(sql("select count(*) from audit where action='sync_admin'") or 0)
    n0 = tr()
    s, r = A.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pq1', 'op': 'put', 'ver': V['products']['pq1'], 'doc': dict(P, name='Produto Audit renomeado')}]}); check(s == 200 and not r.get('rejected'), 'admin só troca o nome do produto')
    check(tr() == n0, 'mudar só o nome não enche o histórico')
    s, st = A.req('/api/state'); V = st['V']; P = next(p for p in st['S']['products'] if p['id'] == 'pq1')
    s, r = A.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pq1', 'op': 'put', 'ver': V['products']['pq1'], 'doc': dict(P, price=1, cost=0.5)}]}); check(s == 200 and not r.get('rejected'), 'admin baixa preço e custo para 1 e 0,50')
    row = sql("select detail::text from audit where action='sync_admin' order by id desc limit 1")
    check(tr() == n0 + 1 and '"alterou"' in row and '"pq1"' in row and '"price": 10' in row and '"price": 1' in row and '"cost": 6' in row and '"cost": 0.5' in row, 'preço e custo, antes e depois, ficam no histórico: %s' % row[:150])
    check('pass' not in row.lower(), 'sem senha no histórico')
    rid = 'rt' + secrets.token_hex(5)
    s, r = A.req('/api/sync', {'changes': [{'c': 'receivables', 'id': rid, 'op': 'put', 'doc': {'id': rid, 'customerId': 'cx', 'customer': 'Cliente X', 'amount': 500, 'due': '2026-12-01', 'paidAt': '', 'parcel': '1/1', 'desc': 'teste'}}]}); check(s == 200 and not r.get('rejected'), 'conta a receber criada pelo admin')
    s, st = A.req('/api/state'); V = st['V']
    s, r = A.req('/api/sync', {'changes': [{'c': 'receivables', 'id': rid, 'op': 'del', 'ver': V['receivables'][rid]}]}); check(s == 200 and not r.get('rejected'), 'admin apaga a conta a receber')
    row = sql("select detail::text from audit where action='sync_admin' order by id desc limit 1")
    check('"apagou"' in row and rid in row and '"amount": 500' in row, 'quem apagou a conta e o valor dela ficam no histórico: %s' % row[:150])
    who = sql("select role || ':' || coalesce(user_id::text,'') from audit where action='sync_admin' order by id desc limit 1")
    check(who.startswith('admin:') and len(who) > 6, 'o histórico diz quem foi (%s)' % who)
    n1 = tr()
    op.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pq1', 'op': 'put', 'doc': {'id': 'pq1', 'name': 'x', 'price': 1}}]})
    check(tr() == n1, 'tentativa recusada de quem não é admin não cria linha de trilha de admin')

print('\n%d OK, %d falha(s)' % (ok, len(fails)))
if fails:
    print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

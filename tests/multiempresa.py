"""Testes de separação por empresa (Tino), pela API, num banco de TESTE que já tem a empresa principal com dados.
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/multiempresa.py
Opcional (banco migrado da versão anterior): OLD_CREDS=arquivo.json com {"kesfi": "<senha provisória>"}.
Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, urllib.request, http.cookiejar, base64
BASE = os.environ.get('BASE', 'http://localhost:3077')
CPW = os.environ['CENTRAL_PASSWORD']; AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
OLD = json.load(open(os.environ['OLD_CREDS'])) if os.environ.get('OLD_CREDS') else None
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class C:
    def __init__(self, tenant=None):
        self.t = tenant; self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None, tenant='__', raw=False):
        t = self.t if tenant == '__' else tenant
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if t is not None: h['X-Tenant'] = t
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: d = x.read(); return x.status, (d if raw else json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); return e.code, (d if raw else json.loads(d or b'{}'))
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
PNG = 'data:image/png;base64,' + base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5e50000000049454e44ae426082')).decode()

# imagem diferente da principal (mesmo produto e mesma imagem dariam o mesmo nome de foto, cada um com a sua cópia)
PNG_B = 'data:image/png;base64,' + base64.b64encode(bytes.fromhex('89504e470d0a1a0a') + secrets.token_bytes(24)).decode()
print('== empresa principal continua igual')
A = C('@'); s, me = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador da principal entra')
s, st = A.req('/api/state'); SA = st['S']
if not SA['products']:  # banco novo: a principal ganha um produto para comparar
    A.req('/api/sync', {'changes': [{'c': 'products', 'id': 'p1', 'op': 'put', 'doc': {'id': 'p1', 'name': 'Arroz 5kg', 'price': 25, 'cost': 20, 'code': '1', 'ean': '', 'unit': 'UN', 'photo': PNG}}]})
    s, st = A.req('/api/state'); SA = st['S']
check(st['T']['id'] == 'davila' and st['T']['primary'], 'principal recebe a própria empresa')
A0 = C(None); A0.jar = A.jar; A0.op = A.op
s, st0 = A0.req('/api/state', tenant=None); check(s == 200 and len(st0['S']['products']) == len(SA['products']), 'app antigo (sem cabeçalho) segue funcionando na principal')
if OLD:
    check(len(SA['products']) >= 2 and len(SA['orders']) >= 2, 'dados de antes da migração continuam lá')
    check(SA.get('seq') == 1003, 'número do próximo pedido continua de onde parou (1003): %s' % SA.get('seq'))
    k = C('@'); s, _ = k.req('/api/login', {'role': 'cliente', 'login': 'kesfi', 'password': OLD['kesfi']}); check(s == 200, 'cliente cadastrado antes da migração entra')
    ph = next((p['photo'] for p in SA['products'] if str(p.get('photo', '')).startswith('/api/photo/')), None)
    s, _ = A.req(ph, raw=True, tenant=None) if ph else (0, None); check(s == 200, 'foto de antes da migração abre')

print('== Central cria a empresa B e o acesso do administrador')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'super_admin entra')
s, r = cen.req('/api/central/tenant', {'name': 'Suple Teste ' + secrets.token_hex(2), 'segment': 'suplementos', 'status': 'em_preparo', 'color': '#1D4ED8'}); TB = r['tenant']['id']
check(s == 200 and not r['tenant']['primary'], 'empresa B criada: ' + TB)
s, r = cen.req('/api/central/tenant-admin', {'id': TB, 'login': AL}); BPW0 = r.get('password')
check(s == 200 and r['login'] == AL and BPW0 and len(BPW0) >= 12, 'acesso do administrador de B criado (mesmo usuário da principal, outra empresa)')
s, r = cen.req('/api/central/tenant-admin', {'id': 'davila', 'login': 'x'}); check(s == 400, 'Central não mexe no administrador da principal')
s, r = A.req('/api/central/tenant-admin', {'id': TB, 'login': 'hack'}); check(s == 401, 'administrador da loja não cria acesso em outra empresa')
s, b = C(TB).req('/api/brand'); check(s == 200 and b['id'] == TB and not b['primary'], 'endereço /t/B mostra a marca de B antes do login')
s, _ = C('nao-existe').req('/api/brand'); check(s == 404, 'empresa inexistente: 404')
s, _ = C('../x').req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 404, 'nome de empresa inválido no cabeçalho é recusado')

print('== login e senha da empresa B')
B = C(TB)
s, _ = B.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 401, 'senha da principal NÃO entra na empresa B')
s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': BPW0}, tenant='@'); check(s == 401, 'senha de B NÃO entra na principal')
A = C('@'); A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW})
s, me = B.req('/api/login', {'role': 'admin', 'login': AL, 'password': BPW0}); check(s == 200 and me['mustReset'], 'administrador de B entra com a provisória e precisa trocar')
s, _ = B.req('/api/state'); check(s == 403, 'antes de trocar a senha, nada abre')
BPW = pw(); s, _ = B.req('/api/password', {'current': BPW0, 'next': BPW}); check(s == 200, 'administrador de B cria a própria senha')
s, sb = B.req('/api/state'); SB = sb['S']
check(s == 200 and len(SB['products']) == 0 and len(SB['orders']) == 0 and len(SB['customers']) == 0, 'empresa B começa vazia (não vê nada da principal)')
check(sb['T']['id'] == TB and sb['T']['modules']['pagar'] is False and sb['T']['modules']['comissao'] is True, 'B recebe os módulos do pacote de suplementos')
check(SB['store']['name'].startswith('SUPLE TESTE'), 'B tem o próprio nome de loja')
check(me['refId'] != A.req('/api/me')[1]['refId'], 'administrador de B tem cadastro diferente do da principal (mesmo usuário)')
check(SB.get('seq') == 1001, 'pedidos de B começam no 1001')

print('== uma empresa não alcança a outra')
s, _ = B.req('/api/state', tenant='@'); check(s == 401, 'sessão de B no endereço da principal: não logado')
s, _ = A.req('/api/state', tenant=TB); check(s == 401, 'sessão da principal no endereço de B: não logado')
pid = SA['products'][0]['id'] if SA['products'] else 'p1'
s, r = B.req('/api/sync', {'changes': [{'c': 'products', 'id': pid, 'op': 'put', 'doc': {'id': pid, 'name': 'Whey 900g', 'price': 99, 'cost': 70, 'code': '9', 'ean': '', 'unit': 'UN', 'photo': PNG_B}}]})
check(s == 200 and not r.get('rejected'), 'B cria produto com o MESMO código interno de um produto da principal')
s, sa2 = A.req('/api/state'); pa = next((p for p in sa2['S']['products'] if p['id'] == pid), None)
check(pa is not None and pa['name'] != 'Whey 900g', 'produto da principal não foi tocado')
s, sb2 = B.req('/api/state'); pb = next(p for p in sb2['S']['products'] if p['id'] == pid)
check(pb['name'] == 'Whey 900g' and len(sb2['S']['products']) == 1, 'B vê só o produto dela')
s, _ = A.req(pb['photo'], raw=True, tenant=None); check(s == 404, 'principal NÃO abre a foto de B pelo endereço')
s, _ = B.req(pb['photo'], raw=True, tenant=None); check(s == 200, 'B abre a própria foto')
if SA['products'] and str(SA['products'][0].get('photo', '')).startswith('/api/photo/'):
    s, _ = B.req(SA['products'][0]['photo'], raw=True, tenant=None); check(s == 404, 'B NÃO abre foto da principal')
s, r = B.req('/api/sync', {'changes': [{'c': 'products', 'id': pid, 'op': 'del', 'ver': sb2['V']['products'][pid]}]})
s, sa3 = A.req('/api/state'); check(any(p['id'] == pid for p in sa3['S']['products']) == bool(pa), 'apagar em B não apaga na principal')
s, r = B.req('/api/sync', {'changes': [{'c': 'payables', 'id': 'pgB', 'op': 'put', 'doc': {'id': 'pgB', 'desc': 'x', 'value': 1, 'due': '2026-11-10'}}]})
check(s == 200 and r.get('rejected'), 'módulo desligado em B (contas a pagar) é recusado em B')
s, r = B.req('/api/sync', {'changes': [{'c': 'receivables', 'id': 'rcB', 'op': 'put', 'doc': {'id': 'rcB', 'amount': 1, 'due': '2026-11-10'}}]})
check(s == 200 and r.get('rejected'), 'contas a receber desligado em B: gravação recusada no servidor')
s, r = B.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'lastWeek', 'op': 'put', 'doc': {'ids': []}}]})
check(s == 200 and r.get('rejected'), 'ofertas da semana desligado em B: gravação recusada no servidor')
s, sbx = B.req('/api/state'); check(sbx['S'].get('receivables') == [] and sbx['S'].get('payables') == [] and 'lastWeek' not in sbx['S'], 'dados de módulos desligados não são enviados para B')
s, r = A.req('/api/sync', {'changes': [{'c': 'payables', 'id': 'pgA' + secrets.token_hex(2), 'op': 'put', 'doc': {'id': 'pgA', 'desc': 'x', 'value': 1, 'due': '2026-11-10'}}]})
check(s == 200 and not r.get('rejected'), '...e continua aceito na principal')
SPW = pw()
s, r = B.req('/api/sync', {'changes': [{'c': 'sellers', 'id': 's1', 'op': 'put', 'doc': {'id': 's1', 'name': 'Vend B', 'login': 'vend', 'pass': SPW, 'margin': 10}}]})
check(s == 200 and not r.get('rejected'), 'B cadastra vendedor "vend" (mesmo usuário de um vendedor da principal)')
s, _ = C(TB).req('/api/login', {'role': 'vendedor', 'login': 'vend', 'password': SPW}); check(s == 403, 'loja "em preparo": só o administrador entra (vendedor recusado)')
s, st = cen.req('/api/central/state'); tb0 = next(t for t in st['tenants'] if t['id'] == TB)
s, _ = cen.req('/api/central/tenant', {'id': TB, 'name': tb0['name'], 'segment': tb0['segment'], 'status': 'ativa', 'color': tb0['color'], 'logo': None, 'modules': {}}); check(s == 200, 'Central ativa a empresa B')
s, _ = C(TB).req('/api/login', {'role': 'vendedor', 'login': 'vend', 'password': SPW}); check(s == 200, 'vendedor de B entra em B (ativa)')
s, _ = C('@').req('/api/login', {'role': 'vendedor', 'login': 'vend', 'password': SPW}); check(s == 401, 'vendedor de B NÃO entra na principal')
s, bk = B.req('/api/backup'); check(s == 200 and len(bk['data']['products']) <= 1 and not any(p.get('name') == (pa or {}).get('name') for p in bk['data']['products']), 'backup de B tem só os dados de B')
s, r = B.req('/api/restore', {'data': {'products': [], 'customers': [], 'orders': []}}); check(s == 200, 'B restaura um backup vazio')
s, sa4 = A.req('/api/state'); check(len(sa4['S']['products']) == len(sa3['S']['products']) and len(sa4['S']['orders']) == len(sa3['S']['orders']), 'restaurar em B NÃO apaga nada da principal')
s, r = B.req('/api/temp-passwords', {}); check(s == 200 and all(x['login'] not in ('kesfi',) for x in r['list']), 'senhas provisórias de B só de pessoas de B')

print('== módulos desligados também no backup e no restaurar')
s, bk = B.req('/api/backup'); check(s == 200 and not bk['data'].get('payables') and not bk['data'].get('receivables') and 'lastWeek' not in bk['data'], 'backup de B não leva dados de módulos desligados')
s, r = B.req('/api/restore', {'data': {'products': [], 'customers': [], 'orders': [], 'payables': [{'id': 'ppX', 'amount': 1, 'due': '2026-11-10'}], 'receivables': [{'id': 'rrX', 'amount': 1}], 'lastWeek': {'ids': []}}})
check(s == 200, 'restaurar em B com dados de módulos desligados responde')
s, sbr = B.req('/api/state'); s2, bk2 = B.req('/api/backup')
check(not any(x.get('id') in ('ppX', 'rrX') for x in (bk2['data'].get('payables') or []) + (bk2['data'].get('receivables') or [])), 'restaurar NÃO grava dados de módulos desligados')
s, st = cen.req('/api/central/state'); dav = next(t for t in st['tenants'] if t['primary'])
s, _ = cen.req('/api/central/tenant', {'id': dav['id'], 'name': dav['name'], 'segment': dav['segment'], 'status': 'em_preparo', 'modules': {}}); check(s == 400, 'Central NÃO deixa a empresa principal "em preparo"')
s, m = C(None).req('/api/manifest?t=' + TB, tenant=None); check(s == 200 and m.get('start_url') == '/t/' + TB + '/' and m.get('scope') == '/t/' + TB + '/', 'app instalado a partir de /t/B abre a empresa B')
s, _ = C(None).req('/api/manifest?t=davila', tenant=None); check(s == 404, 'manifesto por empresa não vale para a principal (ela usa o próprio)')

print('== suspender a empresa B')
s, st = cen.req('/api/central/state'); tb = next(t for t in st['tenants'] if t['id'] == TB)
check(tb['stats']['users'] >= 1 and tb['adminLogin'] == AL, 'Central mostra números e administrador de B')
s, r = cen.req('/api/central/tenant', {'id': TB, 'name': tb['name'], 'segment': tb['segment'], 'status': 'suspensa', 'color': tb['color'], 'logo': None, 'modules': {}})
check(s == 200, 'B suspensa pela Central')
s, r = cen.req('/api/central/tenant', {'id': TB, 'modules': {'sabores': True}}); check(s == 200 and r['tenant']['status'] == 'suspensa' and r['tenant']['color'] == tb['color'], 'mudar só os módulos NÃO reativa a empresa nem apaga a cor')
s, _ = B.req('/api/state'); check(s == 403, 'sessão aberta de B para de valer')
s, _ = C(TB).req('/api/login', {'role': 'admin', 'login': AL, 'password': BPW}); check(s == 403, 'ninguém de B entra suspensa')
s, _ = A.req('/api/state'); check(s == 200, 'principal segue normal')
cen.req('/api/central/tenant', {'id': TB, 'name': tb['name'], 'segment': tb['segment'], 'status': 'ativa', 'color': tb['color'], 'logo': None, 'modules': {}})
s, _ = C(TB).req('/api/login', {'role': 'admin', 'login': AL, 'password': BPW}); check(s == 200, 'reativada, B entra de novo')
s, r = cen.req('/api/central/tenant-admin', {'id': TB, 'login': AL}); s2, _ = B.req('/api/state')
check(s == 200 and s2 == 401, 'nova senha gerada pela Central derruba a sessão antiga do administrador de B')
B = C(TB); B.req('/api/login', {'role': 'admin', 'login': AL, 'password': r['password']})
s, r2 = cen.req('/api/central/tenant-admin', {'id': TB, 'login': 'novo.dono'}); s3, _ = B.req('/api/me')
check(s == 200 and r2['login'] == 'novo.dono' and s3 == 401, 'gerar acesso com OUTRO usuário derruba o administrador anterior')
s, _ = C(TB).req('/api/login', {'role': 'admin', 'login': AL, 'password': r['password']}); check(s == 401, 'usuário antigo do administrador deixa de existir')
s, st = cen.req('/api/central/state'); tb = next(t for t in st['tenants'] if t['id'] == TB)
check(tb['adminLogin'] == 'novo.dono' and tb['stats']['admins'] == 1, 'Central mostra o administrador atual e só ele: %s / %s' % (tb['adminLogin'], tb['stats']['admins']))
s, r = cen.req('/api/central/tenant-admin', {'id': TB, 'login': 'Zé Silva'}); check(s == 400, 'usuário com espaço/acento/maiúscula é recusado com mensagem')
s, r = cen.req('/api/central/tenant', {'name': '<b>Nome</b> X <script>alert(1)</script>', 'segment': 'basico'}); check(s == 200 and r['tenant']['name'] == 'Nome X', 'nome com marcações fica limpo (sem o conteúdo de script): ' + str(r.get('tenant', {}).get('name')))
s, _ = cen.req('/api/central/tenant', {'name': 'X Teste', 'segment': '__proto__'}); check(s == 400, 'segmento "__proto__" recusado (sem erro 500)')
s, _ = cen.req('/api/central/tenant', {'name': 'X Teste', 'segment': 'constructor'}); check(s == 400, 'segmento "constructor" recusado')
s, _ = cen.req('/api/central/tenant', {'name': 'X Teste', 'modules': {'constructor': True}}); check(s == 400, 'módulo "constructor" recusado')
s, b = C(None).req('/api/brand', tenant=TB.upper()); check(s == 200 and b['id'] == TB and 'status' not in b, 'empresa em maiúsculas acha a empresa certa; situação não é exposta')
s, h = C(None).req('/api/health', tenant=None); check(s == 200 and 'users' not in h, '/api/health não revela quantos usuários existem')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

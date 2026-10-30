"""Testes da Central do sistema (Tino) pela API, num banco de TESTE vazio.
Uso: BASE=http://localhost:3077 SETUP_CODE=... CENTRAL_PASSWORD=... python3 tests/central.py
CENTRAL_PASSWORD é a senha cujo hash está em lib/central-cred.js no ambiente de teste.
Sai com código 1 se algo falhar. Deixe o teste de bloqueio por último (ele tranca o IP por 15 min).
"""
import json, os, secrets, sys, urllib.request, http.cookiejar
BASE = os.environ.get('BASE', 'http://localhost:3077')
SETUP = os.environ['SETUP_CODE']; CPW = os.environ['CENTRAL_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar)); self.last = None
    def req(self, path, body=None, headers=None):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if headers is not None: h = headers
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as resp: self.last = resp.headers; return resp.status, json.loads(resp.read() or b'{}')
        except urllib.error.HTTPError as e:
            self.last = e.headers; return e.code, json.loads(e.read() or b'{}')
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'

print('== acesso à Central')
c = Client()
s, _ = c.req('/api/central/state'); check(s == 401, 'sem login a Central não abre')
s, _ = c.req('/api/central/login', {'login': 'super_admin', 'password': CPW}, headers={'Content-Type': 'application/json'}); check(s == 403, 'login sem o cabeçalho do app é recusado (CSRF)')
s, _ = c.req('/api/central/login', {'login': 'super_admin', 'password': CPW}, headers={'Content-Type': 'application/json', 'X-App': '1', 'Origin': 'https://site-malicioso.example'}); check(s == 403, 'login vindo de outro site é recusado')
s, r = c.req('/api/central/login', {'login': 'super_admin', 'password': 'errada-123456'}); check(s == 401 and 'incorretos' in r.get('error', ''), 'senha errada é recusada com mensagem genérica')
s, r = c.req('/api/central/login', {'login': 'admin', 'password': CPW}); check(s == 401, 'usuário errado com a senha certa é recusado')
s, r = c.req('/api/central/login', {'login': ' Super_Admin ', 'password': CPW}); check(s == 200 and r.get('login') == 'super_admin', 'super_admin entra')
sc = c.last.get('Set-Cookie', '')
check('HttpOnly' in sc and 'SameSite=Strict' in sc and 'csid=' in sc, 'cookie da Central é HttpOnly e SameSite=Strict')
s, st = c.req('/api/central/state'); check(s == 200 and st['me']['login'] == 'super_admin', 'Central carrega')
dav = next(t for t in st['tenants'] if t['id'] == 'davila')
check(dav['primary'] and all(dav['modules'].values()), 'empresa atual começa com todos os módulos ligados')
check(len(st['modules']) >= 20 and any(m['essential'] for m in st['modules']), 'catálogo de módulos com essenciais')
check('hash' not in json.dumps(st) and 'scrypt' not in json.dumps(st), 'Central não devolve hash de senha')

print('== Central e loja não se misturam')
adm = Client(); APW = pw()
s, r = adm.req('/api/setup', {'code': SETUP, 'name': 'Dono', 'login': 'eduardo', 'password': APW}); check(s == 200, 'administrador da loja criado (banco de teste)')
s, _ = adm.req('/api/central/state'); check(s == 401, 'sessão de administrador da loja NÃO abre a Central')
s, _ = c.req('/api/state'); check(s == 401, 'sessão da Central NÃO abre os dados da loja')
s, r = adm.req('/api/state'); check(s == 200 and r.get('T', {}).get('modules', {}).get('pagar') is True, 'app recebe os módulos da empresa')
check('logo' in r['T']['brand'] and r['T']['id'] == 'davila', 'app recebe a marca da empresa')

print('== validação do que chega na Central')
base = {k: dav[k] for k in ('id', 'name', 'logo', 'color', 'segment', 'status')}
def save(**kw):
    b = dict(base); b.update(kw); return c.req('/api/central/tenant', b)
s, _ = save(color='red; background:url(x)'); check(s == 400, 'cor inválida recusada')
s, _ = save(logo='data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='); check(s == 400, 'logo SVG recusada (pode carregar código)')
s, _ = save(logo='data:image/png;base64,' + 'A' * 500000); check(s in (400, 413), 'logo grande demais recusada')
s, _ = save(modules={'naoexiste': True}); check(s == 400, 'módulo desconhecido recusado')
s, _ = save(modules={'pagar': 'sim'}); check(s == 400, 'valor de módulo inválido recusado')
s, _ = save(status='suspensa'); check(s == 400, 'empresa principal não pode ser suspensa pela Central')
s, _ = save(id='nao-existe'); check(s == 404, 'empresa inexistente: 404')
s, r = save(name='<b>Atacado</b> Teste'); check(s == 200 and '<' not in r['tenant']['name'], 'nome sem < > (sem HTML)')
s, _ = adm.req('/api/central/tenant', dict(base, name='Invasão')); check(s == 401, 'administrador da loja não altera empresas')

print('== módulos desligados valem no servidor')
s, r = save(modules={'pagar': False, 'conferencia': False, 'negociacao': False})
check(s == 200 and r['tenant']['modules']['pagar'] is False and r['tenant']['modules']['receber'] is True, 'desliga só o que foi pedido')
s, r = adm.req('/api/state'); check(r['T']['modules']['pagar'] is False, 'app vê "Contas a pagar" desligado')
doc = {'id': 'pg1', 'desc': 'Teste', 'value': 10, 'due': '2026-11-10'}
s, r = adm.req('/api/sync', {'changes': [{'c': 'payables', 'id': 'pg1', 'op': 'put', 'doc': doc}]})
check(s == 200 and r.get('rejected') and 'desligada' in r['rejected'][0]['error'], 'servidor recusa gravar conta a pagar com o módulo desligado')
# conferente: criar com o módulo ligado, depois desligar
save(modules={'conferencia': True})
CKPW = pw()
s, r = adm.req('/api/sync', {'changes': [{'c': 'checkers', 'id': 'ck1', 'op': 'put', 'doc': {'id': 'ck1', 'name': 'Conf Teste', 'login': 'confteste', 'pass': CKPW}}]})
check(s == 200 and not r.get('rejected'), 'conferente cadastrado com o módulo ligado')
ck = Client(); s, _ = ck.req('/api/login', {'role': 'conferente', 'login': 'confteste', 'password': CKPW}); check(s == 200, 'conferente entra com o módulo ligado')
save(modules={'conferencia': False})
s, _ = ck.req('/api/me'); check(s == 403, 'sessão do conferente para de valer ao desligar o módulo')
ck2 = Client(); s, r = ck2.req('/api/login', {'role': 'conferente', 'login': 'confteste', 'password': CKPW}); check(s == 403, 'conferente não entra com o módulo desligado')
save(modules={'pagar': True, 'conferencia': True, 'negociacao': True})
s, r = adm.req('/api/sync', {'changes': [{'c': 'payables', 'id': 'pg1', 'op': 'put', 'doc': doc}]})
check(s == 200 and not r.get('rejected'), 'religado: conta a pagar grava normalmente')
s, r = adm.req('/api/state'); check(all(r['T']['modules'].values()), 'empresa volta a ter todos os módulos ligados')

print('== nova empresa pelo segmento')
s, r = c.req('/api/central/tenant', {'name': 'Distribuidora de Suplementos', 'segment': 'suplementos', 'color': '#1D4ED8', 'status': 'em_preparo'})
t = r.get('tenant', {})
check(s == 200 and t.get('id') == 'distribuidora-de-suplementos' and not t.get('primary'), 'empresa nova criada')
on = sorted(k for k, v in t.get('modules', {}).items() if v)
check(on == sorted(['catalogo', 'pedidos', 'clientes', 'usuarios', 'comissao', 'tabela_ie', 'margem', 'sabores', 'painel']), 'pacote de suplementos aplicado: ' + ','.join(on))
s, r = c.req('/api/central/tenant', {'name': 'Distribuidora de Suplementos', 'segment': 'suplementos'}); check(s == 200 and r['tenant']['id'] != t['id'], 'nome repetido ganha outro código')
s, r = adm.req('/api/state'); check(r['T']['id'] == 'davila', 'empresa nova não mexe na empresa atual')

print('== sair')
s, _ = c.req('/api/central/logout', {}); s2, _ = c.req('/api/central/state'); check(s == 200 and s2 == 401, 'sair encerra a sessão da Central')

print('== bloqueio por tentativas (por último)')
b = Client()
for i in range(5): b.req('/api/central/login', {'login': 'super_admin', 'password': 'errada-' + str(i) + 'abc'})
s, r = b.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 429, 'depois de 5 erros, nem a senha certa entra por 15 min')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

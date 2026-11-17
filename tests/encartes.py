"""Testes do Gerador de Encartes (Tino, segmento 'encartes') pela API, num banco de TESTE.
Uso: BASE=http://localhost:3077 CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/encartes.py
(ADMIN_* = administrador da empresa principal, criado antes pelo /api/setup). Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, base64, urllib.request, http.cookiejar
BASE = os.environ.get('BASE', 'http://localhost:3077')
CPW = os.environ['CENTRAL_PASSWORD']; AL = os.environ['ADMIN_LOGIN']; APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
class C:
    def __init__(self, tenant):
        self.t = tenant; self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar), NoRedirect())
    def req(self, path, body=None, tenant=None, headers=None, raw=False):
        h = {'X-App': '1'}
        if body is not None: h['Content-Type'] = 'application/json'
        t = tenant if tenant is not None else self.t
        if t is not None: h['X-Tenant'] = t
        if headers is not None: h = headers
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as resp:
                d = resp.read(); return (resp.status, d, dict(resp.headers)) if raw else (resp.status, json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); return (e.code, d, dict(e.headers)) if raw else (e.code, json.loads(d or b'{}') if d[:1] in (b'{', b'[') else {})
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
hx = secrets.token_hex
xid = lambda: 'x' + hx(6); vid = lambda: 'v' + hx(4); oid = lambda: 'o' + hx(8); chave = lambda: hx(16)
PNG = 'data:image/png;base64,' + base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082')).decode()


print('== Central: empresa de encartes e acesso do dono')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'super_admin entra')
s, st = cen.req('/api/central/state'); check(any(r['id'] == 'encartes' for r in st['ramos']) and 'encModules' in st, 'segmento Encartes aparece na Central')
s, r = cen.req('/api/central/tenant', {'name': 'Encartes Teste', 'ramo': 'encartes', 'status': 'ativa'}); check(s == 200 and r['tenant']['ramo'] == 'encartes', 'cria empresa de encartes'); TID = r['tenant']['id']
s, r2 = cen.req('/api/central/tenant', {'name': 'Encartes Outra', 'ramo': 'encartes', 'status': 'ativa'}); TID2 = r2['tenant']['id']
s, a = cen.req('/api/central/tenant-admin', {'id': TID, 'login': 'dono', 'name': 'Dono'}); check(s == 200 and a['password'], 'acesso do dono criado')
s, a2 = cen.req('/api/central/tenant-admin', {'id': TID2, 'login': 'dono2', 'name': 'Dono 2'})
s, h, hd = C(None).req('/t/' + TID + '/', raw=True); check(s == 200 and b'/encartes/tino.js' in h and b'<script>' not in h, 'página da empresa é o gerador de encartes, sem script dentro da página (CSP)')

def entra(t, login, senha, nova):
    c = C(t); s, me = c.req('/api/login', {'login': login, 'password': senha}); assert s == 200, (s, me)
    if me.get('mustReset'): s, _ = c.req('/api/password', {'current': senha, 'next': nova}); assert s == 200
    return c
P1 = pw(); dono = entra(TID, 'dono', a['password'], P1)
s, me = dono.req('/api/encartes/me'); check(s == 200 and me['dono'] is True and me['id'].startswith('a_'), 'dono entra e é reconhecido como dono')
print('== nuvem: documentos e imagens')
s, _ = dono.req('/api/encartes/doc', {'p': 'app/estado', 'data': {'savedAt': 1, 'data': '{"x":1}'}}); check(s == 200, 'grava o estado')
s, d = dono.req('/api/encartes/doc?p=app/estado'); check(s == 200 and d['exists'] and d['data']['data'] == '{"x":1}', 'lê o estado de volta')
s, _ = dono.req('/api/encartes/doc', {'p': 'salvos/a1', 'data': {'at': 1, 'data': '{}'}}); s, _ = dono.req('/api/encartes/doc', {'p': 'salvos/a2', 'data': {'at': 2, 'data': '{}'}})
s, c = dono.req('/api/encartes/col?p=salvos'); check(s == 200 and len(c['docs']) == 2, 'lista os encartes salvos')
s, _ = dono.req('/api/encartes/doc', {'p': 'salvos/a2', 'del': True}); s, c = dono.req('/api/encartes/col?p=salvos'); check(len(c['docs']) == 1, 'apaga um encarte salvo')
s, b = dono.req('/api/encartes/blob', {'data': PNG}); check(s == 200 and len(b['id']) == 32, 'sobe uma imagem')
s, img, hh = dono.req('/api/encartes/blob?id=' + b['id'], raw=True, headers={}); check(s == 200 and img[:4] == bytes.fromhex('89504e47') and hh.get('Content-Type') == 'image/png', 'a imagem volta igual (no <img>, pela sessão)')
s, _ = dono.req('/api/encartes/blob', {'data': 'data:text/html;base64,PHNjcmlwdD4='}); check(s == 400, 'só aceita imagem')
s, _ = dono.req('/api/encartes/doc', {'p': '../x', 'data': {}}); check(s == 400, 'endereço estranho é recusado')
print('== usuários: modo automático')
s, f = dono.req('/api/encartes/pessoa', {'nome': 'Maria', 'login': 'maria'}); check(s == 200 and f['password'], 'dono cria o acesso da funcionária')
s, L = dono.req('/api/encartes/pessoas'); check(s == 200 and sorted(x['login'] for x in L['pessoas']) == ['dono', 'maria'], 'lista de usuários (dono e funcionária)')
check([x['tipo'] for x in L['pessoas'] if x['login'] == 'maria'] == ['auto'] and [x['principal'] and x['voce'] for x in L['pessoas'] if x['login'] == 'dono'] == [True], 'tipos e marcação do dono principal')
s, _ = dono.req('/api/encartes/pessoa', {'login': 'dono', 'ativo': False}); check(s == 403, 'dono principal não é desligado pela aba Usuários')
s, _ = dono.req('/api/encartes/pessoa', {'criar': True, 'nome': 'Maria 2', 'login': 'maria'}); check(s == 400, 'não cria usuário repetido')
print('== usuários: administrador')
s, g = dono.req('/api/encartes/pessoa', {'criar': True, 'tipo': 'adm', 'nome': 'Gerente', 'login': 'gerente'}); check(s == 200 and g['password'] and g['tipo'] == 'adm', 'dono cria um administrador')
ger = entra(TID, 'gerente', g['password'], pw())
s, me = ger.req('/api/encartes/me'); check(s == 200 and me['dono'] is True and me['id'].startswith('a_'), 'administrador entra com acesso completo')
s, _ = ger.req('/api/encartes/doc', {'p': 'app/catalogo', 'data': {'at': 1}}); check(s == 200, 'administrador grava o banco de produtos')
s, _ = ger.req('/api/encartes/pessoa', {'login': 'gerente', 'ativo': False}); check(s == 403, 'administrador não altera o próprio acesso')
s, _ = ger.req('/api/encartes/pessoa', {'login': 'dono', 'novaSenha': True}); check(s == 403, 'administrador não mexe no dono principal')
s, z = ger.req('/api/encartes/pessoa', {'criar': True, 'tipo': 'auto', 'nome': 'José', 'login': 'jose'}); check(s == 200 and z.get('tipo') == 'auto', 'administrador cria acesso no modo automático')
s, _ = dono.req('/api/encartes/pessoa', {'login': 'gerente', 'tipo': 'auto'}); s, _ = ger.req('/api/encartes/me'); check(s == 401, 'mudar o tipo derruba a sessão')
s, L = dono.req('/api/encartes/pessoas'); check([x['tipo'] for x in L['pessoas'] if x['login'] == 'gerente'] == ['auto'], 'gerente agora é modo automático')
func = entra(TID, 'maria', f['password'], pw())
s, me = func.req('/api/encartes/me'); check(s == 200 and me['dono'] is False and me['id'].startswith('f_'), 'funcionária entra e não é dona')
s, d = func.req('/api/encartes/doc?p=app/estado'); check(s == 200 and d['exists'], 'funcionária lê a campanha do dono')
s, _ = func.req('/api/encartes/doc', {'p': 'data/users/' + me['id'] + '/rascunho', 'data': {'savedAt': 1, 'data': '{}'}}); check(s == 200, 'funcionária grava o próprio rascunho')
s, _ = func.req('/api/encartes/doc?p=data/users/a_outro/rascunho'); check(s == 403, 'funcionária não lê rascunho de outra pessoa')
s, _ = func.req('/api/encartes/doc', {'p': 'app/catalogo', 'data': {'at': 1}}); check(s == 403, 'funcionária não grava o banco de produtos')
s, _ = func.req('/api/encartes/pessoas'); check(s == 403, 'funcionária não vê a equipe')
s, _ = func.req('/api/encartes/pessoa', {'nome': 'Zé', 'login': 'ze'}); check(s == 403, 'funcionária não cria acesso')
s, _ = dono.req('/api/encartes/pessoa', {'login': 'maria', 'ativo': False}); s, _ = func.req('/api/encartes/me'); check(s == 401, 'desligar o acesso derruba a sessão da funcionária')
print('== voz dos vídeos (ElevenLabs de mentira)')
FAKE = os.environ.get('FAKE_EL')
def falas():
    with urllib.request.urlopen('http://127.0.0.1:%s/count' % FAKE) as r: return json.loads(r.read())
if FAKE:
    s, st = dono.req('/api/encartes/voz'); check(s == 200 and st['ligada'] is True and st['usado'] == 0 and st['limite'] == 30000, 'situação da voz: ligada, nada usado, limite do Starter')
    fala = {'texto': 'Picanha bovina, quarenta e nove e noventa o quilo, no app!'}
    s, e = dono.req('/api/encartes/voz', dict(fala, estimar=True)); check(s == 200 and e['cache'] is False and e['cred'] == len(fala['texto']) and 'audio' not in e and falas()['n'] == 0, 'estimar não gasta nada')
    s, g1 = dono.req('/api/encartes/voz', fala); check(s == 200 and g1['cache'] is False and base64.b64decode(g1['audio'])[:2] == bytes.fromhex('fffb') and falas()['n'] == 1, 'gera a fala (mp3)')
    check(falas()['last']['voz'] == 'HR2TRGmi4QbMsO5omv7l' and falas()['last']['model'] == 'eleven_multilingual_v2', 'usa a voz e o modelo padrão')
    s, g2 = dono.req('/api/encartes/voz', fala); check(s == 200 and g2['cache'] is True and g2['cred'] == 0 and g2['audio'] == g1['audio'] and falas()['n'] == 1, 'a mesma fala de novo não gasta crédito')
    s, st = dono.req('/api/encartes/voz'); check(st['usado'] == g1['cred'], 'uso do mês somado')
    s, g3 = dono.req('/api/encartes/voz', {'texto': 'Arroz cinco quilos', 'modelo': 'eleven_flash_v2_5'}); check(s == 200 and g3['cred'] == 9 and falas()['last']['model'] == 'eleven_flash_v2_5', 'modelo econômico gasta metade')
    s, _ = dono.req('/api/encartes/doc', {'p': 'app/vozcfg', 'data': {'limite': 10}}); s, x = dono.req('/api/encartes/voz', {'texto': 'Feijão carioca um quilo'}); check(s == 429 and falas()['n'] == 2, 'passou do limite do mês: recusa sem chamar a ElevenLabs')
    s, g4 = dono.req('/api/encartes/voz', fala); check(s == 200 and g4['cache'] is True, 'fala já guardada sai mesmo acima do limite (não gasta)')
    s, _ = dono.req('/api/encartes/voz', {'texto': 'x' * 400}); check(s == 400, 'fala longa demais é recusada')
    # --- conta de créditos à prova de corrida, custo real e saldo de verdade ---
    import threading
    def uso(): return dono.req('/api/encartes/voz')[1]
    s, _ = dono.req('/api/encartes/doc', {'p': 'app/vozcfg', 'data': {'limite': 999999}}); st = uso(); check(st['limite'] == 30000 and st['teto'] == 30000, 'limite da empresa não passa do teto geral da conta')
    check(st['conta'] and st['conta']['usado'] == falas()['gasto'] and st['conta']['limite'] == 30000, 'mostra o saldo de verdade da ElevenLabs')
    s, _ = dono.req('/api/encartes/doc', {'p': 'app/vozuso', 'data': {'mes': st['mes'], 'cred': 0}}); check(s == 403 and uso()['usado'] == st['usado'], 'ninguém zera a conta de créditos pela nuvem')
    s, v = dono.req('/api/encartes/voz?voz=HR2TRGmi4QbMsO5omv7l'); check(v['voz'] and v['voz']['ok'] is True, 'voz padrão existe na conta')
    s, v = dono.req('/api/encartes/voz?voz=VozSumiu0000000000'); check(v['voz'] and v['voz']['ok'] is False, 'avisa quando a voz sumiu da ElevenLabs')
    s, v = dono.req('/api/encartes/voz?voz=VozSaindo000000000'); check(v['voz'] and v['voz']['ok'] is True and v['voz']['some'] == 1900000000, 'avisa a data em que a voz vai sair')
    a = uso()['usado']; n0 = falas()['n']
    s, x = dono.req('/api/encartes/voz', {'texto': 'Alcatra', 'voz': 'VozSumiu0000000000'}); check(s == 424 and 'voz' in x.get('error', '').lower() and uso()['usado'] == a, 'voz que sumiu: a mensagem chega inteira e a reserva de crédito é devolvida')
    s, x = dono.req('/api/encartes/voz', {'texto': 'Alcatra bovina', 'voz': 'VozCara00000000000'}); check(s == 200 and x['cred'] == 28 and uso()['usado'] == a + 28, 'voz com multiplicador: conta o custo cobrado de verdade (o dobro)')
    s, e = dono.req('/api/encartes/voz', dict(fala, estimar=True, refazer=True)); check(s == 200 and e['cred'] == len(fala['texto']) and 'audio' not in e, 'estimar o refazer mostra que vai gastar')
    a = uso()['usado']; n0 = falas()['n']
    s, x = dono.req('/api/encartes/voz', dict(fala, refazer=True)); check(s == 200 and x['cache'] is False and falas()['n'] == n0 + 1 and uso()['usado'] == a + len(fala['texto']), 'refazer grava a fala de novo (e conta o crédito)')
    def junto(corpos):
        out = [None] * len(corpos)
        def vai(i): out[i] = dono.req('/api/encartes/voz', corpos[i])
        ts = [threading.Thread(target=vai, args=(i,)) for i in range(len(corpos))]; [t.start() for t in ts]; [t.join() for t in ts]; return out
    a = uso()['usado']; n0 = falas()['n']; lenta = {'texto': 'Costela devagar no bafo'}
    r = junto([lenta, lenta, lenta]); check([x[0] for x in r] == [200, 200, 200] and falas()['n'] == n0 + 1 and uso()['usado'] == a + len(lenta['texto']) and len(set(x[1]['audio'] for x in r)) == 1, 'a mesma fala pedida 3 vezes ao mesmo tempo é paga uma vez só')
    a = uso()['usado']; n0 = falas()['n']; f1 = {'texto': 'Fraldinha devagar um'}; f2 = {'texto': 'Fraldinha devagar dois'}
    s, _ = dono.req('/api/encartes/doc', {'p': 'app/vozcfg', 'data': {'limite': a + len(f2['texto'])}})
    r = junto([f1, f2]); cods = sorted(x[0] for x in r); check(cods == [200, 429] and falas()['n'] == n0 + 1 and uso()['usado'] <= a + len(f2['texto']), 'duas falas ao mesmo tempo não furam o limite do mês')
    s, _ = dono.req('/api/encartes/doc', {'p': 'app/vozcfg', 'data': {'limite': 30000}})
    check(uso()['conta']['usado'] == falas()['gasto'], 'saldo da ElevenLabs acompanha o gasto')
    jo = entra(TID, 'jose', z['password'], pw())
    s, _ = jo.req('/api/encartes/voz', fala); check(s == 403, 'funcionário não gera voz')
    s, _ = jo.req('/api/encartes/voz'); check(s == 403, 'funcionário não vê o uso da voz')
else:
    print('  (pulado: sem FAKE_EL)')
print('== separação por empresa')
P2 = pw(); outro = entra(TID2, 'dono2', a2['password'], P2)
s, d = outro.req('/api/encartes/doc?p=app/estado'); check(s == 200 and not d['exists'], 'outra empresa não vê o estado desta')
s, _, _h = outro.req('/api/encartes/blob?id=' + b['id'], raw=True, headers={}); check(s == 404, 'outra empresa não vê a imagem desta')
if FAKE: s, e2 = outro.req('/api/encartes/voz', {'texto': 'Picanha bovina, quarenta e nove e noventa o quilo, no app!', 'estimar': True}); check(s == 200 and e2['cache'] is False, 'fala guardada de uma empresa não aparece para outra')
s, _ = dono.req('/api/encartes/me', tenant=TID2); check(s == 401, 'sessão de uma empresa não vale em outra')
s, _ = dono.req('/api/state'); check(s == 404, 'rotas do atacado não existem na empresa de encartes')

print(f'\n{ok} OK, {len(fails)} falha(s)')
for m in fails: print(' -', m)
sys.exit(1 if fails else 0)

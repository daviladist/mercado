"""Testes do app Controle de caixa (Tino, ramo 'caixa') pela API, num banco de TESTE.
Uso: BASE=http://localhost:3077 CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/caixa.py
(ADMIN_* = administrador da empresa principal, criado antes pelo /api/setup)
Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, urllib.request, http.cookiejar
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
                d = resp.read(); return (resp.status, d.decode('utf8', 'replace'), dict(resp.headers)) if raw else (resp.status, json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); return (e.code, d.decode('utf8', 'replace'), dict(e.headers)) if raw else (e.code, json.loads(d or b'{}') if d[:1] in (b'{', b'[') else {})
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'

print('== Central: aba "Controle de caixa"')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'super_admin entra')
s, st = cen.req('/api/central/state')
check(s == 200 and any(r['id'] == 'caixa' for r in st.get('ramos', [])) and len(st.get('caixaModules', [])) >= 1, 'Central conhece o ramo "Controle de caixa"')
s, r = cen.req('/api/central/tenant', {'name': 'Dávila Supermercados', 'ramo': 'caixa'}); T = r.get('tenant', {})
TID = T.get('id')
check(s == 200 and T.get('ramo') == 'caixa' and T.get('status') == 'em_preparo' and all(T['modules'].values()), 'cria "Dávila Supermercados" no ramo caixa, em preparo, com a função essencial ligada')
s, r = cen.req('/api/central/tenant', {'name': 'Outra', 'ramo': 'caixa'}); TX = r['tenant']['id']; check(s == 200, 'cria uma segunda empresa de caixa (para testar a separação)')
s, r = cen.req('/api/central/tenant', {'id': TID, 'modules': {'pdv': True}}); check(s == 400, 'não liga módulo do atacado numa empresa de controle de caixa')
s, r = cen.req('/api/central/tenant-admin', {'id': TID, 'login': 'dono'}); P0 = r.get('password'); check(s == 200 and P0, 'Central cria o acesso do administrador (senha provisória)')
s, r = cen.req('/api/central/tenant', {'id': TID, 'status': 'ativa'}); check(s == 200 and r['tenant']['status'] == 'ativa', 'empresa ativada (para a caixista poder entrar)')

print('== página e acesso')
s, html, h = C(None).req('/t/' + TID + '/', raw=True)
check(s == 200 and 'caixa.js' in html and '<title>Dávila Supermercados</title>' in html, 'endereço da empresa abre o app de controle de caixa')
s, html, h = C(None).req('/t/' + TID + '/cliente', raw=True); check(s == 302 and h.get('Location') == '/t/' + TID + '/', '/cliente de empresa de caixa volta para o app')
s, html, h = C(None).req('/t/' + TID + '/pdv', raw=True); check(s == 302, '/pdv de empresa de caixa volta para o app')
s, mf = C(None).req('/api/manifest?t=' + TID); check(s == 200 and mf.get('name') == 'Dávila Supermercados Caixa', 'app instalado no celular tem nome próprio')

A = C(TID)
s, _ = A.req('/api/caixa/state'); check(s == 401, 'sem login não lê nada')
s, me = A.req('/api/login', {'role': 'admin', 'login': 'dono', 'password': P0}); check(s == 200 and me.get('mustReset'), 'dono entra com a provisória e precisa trocar')
s, _ = A.req('/api/caixa/state'); check(s == 403, 'antes de trocar a senha, nada abre')
NP = pw(); s, _ = A.req('/api/password', {'current': P0, 'next': NP}); check(s == 200, 'dono cria a própria senha')
s, st = A.req('/api/caixa/state'); check(s == 200 and st['cfg'] is None and st['saldo'] == 0 and st['mov'] == [] and st['pessoas'] == [], 'estado inicial: sem saldo configurado, sem lançamentos, sem pessoas')
s, _ = A.req('/api/state'); check(s == 404, 'rotas do atacado não existem para a empresa de caixa')
s, _ = A.req('/api/rural/state'); check(s == 404, 'rotas do produtor rural não existem para a empresa de caixa')
s, _ = A.req('/api/caixa/sangria', {'valor': 10, 'data': '2026-10-01', 'motivo': 'x'}, headers={'Content-Type': 'application/json', 'X-Tenant': TID}); check(s == 403, 'gravação sem o cabeçalho do app é recusada (CSRF)')
s, _ = A.req('/api/caixa/state', tenant='@'); check(s == 401, 'sessão do dono não vale no endereço da principal')
s, _ = A.req('/api/caixa/state', tenant=TX); check(s == 401, 'sessão do dono não vale em outra empresa de caixa')
P = C(None); s, _ = P.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador da principal entra')
s, _ = P.req('/api/caixa/state'); check(s == 404, 'empresa de atacado não tem as rotas do controle de caixa')

print('== saldo inicial')
s, _ = A.req('/api/caixa/cfg', {'saldoInicial': '-1', 'dataInicial': '2026-10-01'}); check(s == 400, 'saldo inicial negativo recusado')
s, _ = A.req('/api/caixa/cfg', {'saldoInicial': '20000', 'dataInicial': '2099-01-01'}); check(s == 400, 'data inicial no futuro recusada')
s, _ = A.req('/api/caixa/cfg', {'saldoInicial': '20.000,00', 'dataInicial': '2026-10-01'}); check(s == 200, 'define o saldo inicial: R$ 20.000,00')
s, st = A.req('/api/caixa/state'); check(s == 200 and st['cfg']['saldoInicial'] == 20000 and st['cfg']['dataInicial'] == '2026-10-01' and st['saldo'] == 20000, 'saldo = saldo inicial, sem lançamentos')
s, _ = A.req('/api/caixa/cfg', {'saldoInicial': '18000', 'dataInicial': '2026-09-28'}); check(s == 200, 'admin corrige o saldo inicial depois')
s, st = A.req('/api/caixa/state'); check(st['cfg']['saldoInicial'] == 18000 and st['saldo'] == 18000, 'saldo corrigido')

print('== pessoa (caixista): só o admin cria/gerencia')
s, r = A.req('/api/caixa/pessoa', {'login': 'ca', 'nome': 'Menina do caixa'}); check(s == 400, 'usuário curto demais recusado')
s, r = A.req('/api/caixa/pessoa', {'login': 'caixista1', 'nome': 'Menina do caixa'}); SENHA0 = r.get('password')
check(s == 200 and SENHA0 and r.get('login') == 'caixista1', 'cria a pessoa que guarda o caixa, com senha provisória')
s, st = A.req('/api/caixa/state'); p = next(p for p in st['pessoas'] if p['login'] == 'caixista1')
check(p['nome'] == 'Menina do caixa' and p['ativo'] and p['trocarSenha'], 'pessoa aparece na lista, ativa, precisando trocar a senha')
s, r = A.req('/api/caixa/pessoa', {'login': 'dono', 'nome': 'X'}); check(s == 400, 'usuário que já é de outra pessoa (o admin) é recusado')

M = C(TID)
s, _ = M.req('/api/caixa/pessoa', {'login': 'x', 'nome': 'x'}); check(s == 401, 'sem login, caixista não gerencia nada (nem logada)')
s, me2 = M.req('/api/login', {'role': 'admin', 'login': 'caixista1', 'password': SENHA0}); check(s == 200 and me2.get('mustReset'), 'caixista entra com a provisória e precisa trocar')
NPC = pw(); s, _ = M.req('/api/password', {'current': SENHA0, 'next': NPC}); check(s == 200, 'caixista cria a própria senha')
s, st2 = M.req('/api/caixa/state'); check(s == 200 and st2['me']['role'] == 'caixista' and st2['pessoas'] == [], 'caixista vê o próprio estado, sem a lista de acessos (coisa do admin)')
s, _ = M.req('/api/caixa/cfg', {'saldoInicial': '0', 'dataInicial': '2026-10-01'}); check(s == 403, 'caixista não define saldo inicial')
s, _ = M.req('/api/caixa/pessoa', {'login': 'outra', 'nome': 'X'}); check(s == 403, 'caixista não cria outro acesso')
s, _ = M.req('/api/caixa/ajuste', {'valor': '-10', 'data': '2026-10-02', 'motivo': 'teste'}); check(s == 403, 'caixista não lança ajuste')
s, _ = M.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-01', 'periodoFim': '2026-10-02'}); check(s == 403, 'caixista não pede consulta ao StarIA')
s, _ = M.req('/api/caixa/mov/excluir', {'id': 'nada'}); check(s == 403, 'caixista não apaga lançamento')

print('== sangria (admin e caixista)')
s, _ = A.req('/api/caixa/sangria', {'valor': '-5', 'data': '2026-10-02', 'motivo': 'x'}); check(s == 400, 'sangria com valor negativo recusada')
s, _ = A.req('/api/caixa/sangria', {'valor': '100', 'data': '2026-10-02', 'motivo': 'a'}); check(s == 400, 'sangria sem motivo (menos de 2 letras) recusada')
s, r = M.req('/api/caixa/sangria', {'valor': '2.500,00', 'data': '2026-10-02', 'motivo': 'depósito Banco do Brasil'}); SG1 = r.get('id')
check(s == 200 and SG1, 'caixista lança sangria de R$ 2.500,00')
s, st = A.req('/api/caixa/state'); sg = next(m for m in st['mov'] if m['id'] == SG1)
check(sg['tipo'] == 'sangria' and sg['valor'] == 2500 and sg['criadoPor'] == 'Menina do caixa' and sg['criadoPorRole'] == 'caixista' and sg['depositadoEm'] is None, 'admin vê a sangria da caixista, ainda não depositada')
check(st['saldo'] == 15500, 'saldo cai com a sangria: 18.000 − 2.500 = 15.500')
s, r = A.req('/api/caixa/sangria', {'valor': '1000', 'data': '2026-10-03', 'motivo': 'reforço no banco'}); SG2 = r.get('id')
check(s == 200, 'admin também pode lançar sangria')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == 14500, 'saldo: 15.500 − 1.000 = 14.500')

print('== marcar sangria como depositada (não muda o saldo)')
s, _ = M.req('/api/caixa/depositado', {'id': SG1, 'depositadoEm': '2026-10-05'}); check(s == 200, 'caixista marca a sangria como depositada')
s, st = A.req('/api/caixa/state'); sg = next(m for m in st['mov'] if m['id'] == SG1)
check(sg['depositadoEm'] == '2026-10-05' and st['saldo'] == 14500, 'fica marcada e o saldo não muda (o dinheiro já tinha saído do caixa)')
s, _ = A.req('/api/caixa/depositado', {'id': SG2, 'depositadoEm': '2026-13-01'}); check(s == 400, 'data de depósito inválida recusada')
s, _ = A.req('/api/caixa/depositado', {'id': 'naoexiste', 'depositadoEm': '2026-10-05'}); check(s == 404, 'depósito em lançamento inexistente recusado')

print('== ajuste (só admin, valor com sinal)')
s, r = A.req('/api/caixa/ajuste', {'valor': '0', 'data': '2026-10-06', 'motivo': 'x'}); check(s == 400, 'ajuste com valor zero recusado')
s, r = A.req('/api/caixa/ajuste', {'valor': '-15', 'data': '2026-10-06', 'motivo': 'taxa do banco'}); AJ = r.get('id')
check(s == 200 and AJ, 'admin lança ajuste negativo')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == 14485, 'saldo: 14.500 − 15 = 14.485')

print('== apagar lançamento (só admin; sangria e ajuste, nunca venda do StarIA)')
s, _ = M.req('/api/caixa/mov/excluir', {'id': AJ}); check(s == 403, 'caixista não apaga nada')
s, _ = A.req('/api/caixa/mov/excluir', {'id': AJ}); check(s == 200, 'admin apaga o ajuste')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == 14500 and not any(m['id'] == AJ for m in st['mov']), 'saldo volta e o ajuste desaparece')

print('== consulta ao StarIA: pendente -> entregue (Claude) -> aplicada direto, em sacolas por filial (a matriz já nasce pronta pra conferir)')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-01', 'periodoFim': '2026-10-07'}); JOB = r.get('id')
check(s == 200 and JOB, 'admin pede a consulta de 01 a 07/10')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-01', 'periodoFim': '2026-10-07'}); check(s == 409, 'pedir de novo o mesmo período (ainda pendente) é recusado')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-07', 'periodoFim': '2026-10-01'}); check(s == 400, 'data final antes da inicial recusada')
s, st = A.req('/api/caixa/state'); job = next(j for j in st['jobs'] if j['id'] == JOB); check(job['status'] == 'pendente' and job['resultado'] is None, 'consulta fica pendente, aguardando o Claude')
s, _ = M.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': {'porFilial': {'1': {'vendasDinheiro': 100, 'recebCrediario': 0}}}}); check(s == 403, 'caixista não entrega resultado do StarIA (nem o Claude usaria essa conta)')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': {'porFilial': {'x': {'vendasDinheiro': 100, 'recebCrediario': 0}}}}); check(s == 400, 'filial inválida no resultado recusada')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': {'porFilial': {'1': {'vendasDinheiro': -5, 'recebCrediario': 0}}}}); check(s == 400, 'valor negativo no resultado recusado')
RES = {'porFilial': {'1': {'vendasDinheiro': 8000, 'recebCrediario': 500}, '2': {'vendasDinheiro': 3000, 'recebCrediario': 0}, '3': {'vendasDinheiro': 1500, 'recebCrediario': 200}}}
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': RES}); check(s == 200, 'resultado entregue: filiais 1, 2 e 3 — já cria as sacolas e aplica a consulta, sem passo de revisão separado')
s, st = A.req('/api/caixa/state'); job = next(j for j in st['jobs'] if j['id'] == JOB)
check(job['status'] == 'aplicada' and job['resultado']['total'] == 13200, 'consulta já aplicada direto: total 8.000+500+3.000+1.500+200 = 13.200 (quem passa a revisar agora são as sacolas, não a consulta)')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': RES}); check(s == 409, 'entregar de novo um resultado já aplicado é recusado')
sacolas = [sc for sc in st['sacolas'] if sc['jobId'] == JOB]
check(len(sacolas) == 3 and {sc['filial'] for sc in sacolas} == {1, 2, 3}, 'uma sacola por filial com venda e/ou crediário (1, 2 e 3)')
sac1 = next(sc for sc in sacolas if sc['filial'] == 1); sac2 = next(sc for sc in sacolas if sc['filial'] == 2); sac3 = next(sc for sc in sacolas if sc['filial'] == 3)
check(sac1['valorStaria'] == 8000 and sac1['crediStaria'] == 500 and sac2['valorStaria'] == 3000 and sac3['valorStaria'] == 1500 and sac3['crediStaria'] == 200, 'cada sacola traz a venda e o crediário (qualquer forma) que o StarIA apontou pra aquela filial')
check(not sac1['precisaChegar'] and sac1['chegouEm'] is not None and sac1['conferidoEm'] is None, 'a sacola da matriz (filial 1) já nasce com "chegou" marcado — ela nunca viaja')
check(sac2['precisaChegar'] and sac2['chegouEm'] is None and sac3['precisaChegar'] and sac3['chegouEm'] is None, 'as sacolas das filiais 2 e 3 nascem "na filial", esperando alguém marcar a chegada')
check(st['miniCaixas']['1']['aguardandoConferencia'] == 8500, 'mini caixa da matriz: 8.000+500 já "aguardando conferência" (não precisou chegar)')
check(st['miniCaixas']['2']['naFilial'] == 3000 and st['miniCaixas']['3']['naFilial'] == 1700, 'mini caixa das filiais 2 e 3: ainda "na filial" (3.000 e 1.500+200)')

print('== sacola: chegou na matriz (caixista, financeiro ou admin) -> conferida (financeiro ou admin, com o valor real de vendas e a forma de pagamento do crediário)')
s, _ = A.req('/api/caixa/sacola/conferir', {'id': sac2['id'], 'valorContado': '3000'}); check(s == 409, 'não dá pra conferir sem a sacola ter chegado na matriz')
s, r = A.req('/api/caixa/sacola/chegou', {'id': sac1['id']}); check(s == 200 and r.get('jaChegou'), 'marcar a chegada da que já chegou sozinha (a matriz) não dá erro (idempotente)')
s, _ = M.req('/api/caixa/sacola/chegou', {'id': sac2['id']}); check(s == 200, 'caixista marca que a sacola da filial 2 chegou na matriz')
s, _ = M.req('/api/caixa/sacola/conferir', {'id': sac1['id'], 'valorContado': '8000', 'crediDinheiro': '500'}); check(s == 403, 'caixista não confere a sacola (só financeiro ou admin digitam o valor real)')
s, r = A.req('/api/caixa/sacola/conferir', {'id': sac1['id'], 'valorContado': '8000', 'crediDinheiro': '500'})
check(s == 200 and r.get('diferenca') == 0 and r.get('crediDiferenca') == 0, 'admin confere a sacola 1: vendas bateram (8.000) e o crediário todo em dinheiro (500) bateu também')
s, r = A.req('/api/caixa/sacola/conferir', {'id': sac2['id'], 'valorContado': '3000'})
check(s == 200 and r.get('diferenca') == 0 and r.get('crediDiferenca') == 0, 'admin confere a sacola 2: 3.000, sem crediário')
A.req('/api/caixa/sacola/chegou', {'id': sac3['id']})
s, r = A.req('/api/caixa/sacola/conferir', {'id': sac3['id'], 'valorContado': '1500', 'crediDinheiro': '200'})
check(s == 200 and r.get('diferenca') == 0 and r.get('crediDiferenca') == 0, 'admin confere a sacola 3: 1.500 de venda + 200 de crediário, tudo em dinheiro')
s, st = A.req('/api/caixa/state'); mvs = [m for m in st['mov'] if m['tipo'] == 'venda_staria' and m['periodoIni'] == '2026-10-01']
crmvs = [m for m in st['mov'] if m['tipo'] == 'crediario_staria' and m['periodoIni'] == '2026-10-01']
check(len(mvs) == 3 and sum(m['valor'] for m in mvs) == 12500, 'uma venda_staria por sacola conferida, só com o valor real contado (8.000+3.000+1.500 = 12.500)')
check(len(crmvs) == 2 and sum(m['valor'] for m in crmvs) == 700 and all(m['status'] == 'aprovado' for m in crmvs), 'um crediario_staria por sacola que teve crediário em dinheiro (500+200 = 700), já aprovado direto — sem passo de revisão separado')
check(st['saldo'] == 14500 + 12500 + 700, 'saldo soma vendas e crediário em dinheiro conforme cada sacola é conferida: 14.500 + 12.500 + 700 = 27.700')
s, _ = A.req('/api/caixa/sacola/conferir', {'id': sac1['id'], 'valorContado': '8000'}); check(s == 409, 'conferir de novo uma sacola já conferida é recusado')
s, _ = A.req('/api/caixa/mov/excluir', {'id': mvs[0]['id']}); check(s == 404, 'lançamento de venda_staria não pode ser apagado (fica sempre)')
s, st = A.req('/api/caixa/state'); check(all(str(f) not in st['miniCaixas'] for f in (1, 2, 3)), 'mini caixa some depois que a sacola é conferida (dinheiro já está no caixa principal)')

print('== acesso do financeiro: confere as sacolas (valor real de vendas e forma de pagamento do crediário)')
s, r = A.req('/api/caixa/pessoa', {'login': 'fi', 'nome': 'X', 'papel': 'financeiro'}); check(s == 400, 'usuário curto demais recusado')
s, r = A.req('/api/caixa/pessoa', {'login': 'financeiro1', 'nome': 'Fulano do financeiro', 'papel': 'financeiro'}); SENHAF0 = r.get('password')
check(s == 200 and SENHAF0 and r.get('papel') == 'financeiro', 'cria o acesso do financeiro')
s, st = A.req('/api/caixa/state'); pf = next(p for p in st['pessoas'] if p['login'] == 'financeiro1')
check(pf['papel'] == 'financeiro' and pf['ativo'] and pf['trocarSenha'], 'financeiro aparece na lista de acessos, com o papel certo')
s, _ = A.req('/api/caixa/pessoa', {'login': 'financeiro1', 'nome': 'Fulano do financeiro', 'papel': 'caixista'}); check(s == 200, 'o papel não muda depois de criado (continua financeiro mesmo pedindo caixista)')
s, st = A.req('/api/caixa/state'); check(next(p for p in st['pessoas'] if p['login'] == 'financeiro1')['papel'] == 'financeiro', 'papel confirmado: continua financeiro')

F = C(TID)
s, _ = F.req('/api/caixa/sacola/conferir', {'id': sac1['id'], 'valorContado': '8000'}); check(s == 401, 'sem login, financeiro não confere nada')
s, mef = F.req('/api/login', {'role': 'admin', 'login': 'financeiro1', 'password': SENHAF0}); check(s == 200 and mef.get('mustReset'), 'financeiro entra com a provisória e precisa trocar')
NPF = pw(); s, _ = F.req('/api/password', {'current': SENHAF0, 'next': NPF}); check(s == 200, 'financeiro cria a própria senha')
s, stf = F.req('/api/caixa/state'); check(s == 200 and stf['me']['role'] == 'financeiro' and stf['pessoas'] == [], 'financeiro vê o próprio estado, sem a lista de acessos (coisa do admin)')
s, r = F.req('/api/caixa/sangria', {'valor': '10', 'data': '2026-10-08', 'motivo': 'teste'}); SGF = r.get('id')
check(s == 200 and SGF, 'financeiro também lança sangria — faz tudo que o caixista faz, não é obrigatório ter as duas pessoas')
s, _ = F.req('/api/caixa/depositado', {'id': SGF, 'depositadoEm': '2026-10-08'}); check(s == 200, 'financeiro também marca sangria como depositada')
s, _ = A.req('/api/caixa/mov/excluir', {'id': SGF}); check(s == 200, 'admin apaga essa sangria de teste (sem deixar isso afetar o saldo daqui pra frente)')
s, _ = F.req('/api/caixa/ajuste', {'valor': '-5', 'data': '2026-10-08', 'motivo': 'x'}); check(s == 403, 'financeiro não lança ajuste (isso continua só do admin)')
s, _ = F.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-08', 'periodoFim': '2026-10-08'}); check(s == 403, 'financeiro não pede consulta ao StarIA')
s, _ = F.req('/api/caixa/mov/excluir', {'id': mvs[0]['id']}); check(s == 403, 'financeiro não apaga nada')
s, _ = F.req('/api/caixa/pessoa', {'login': 'outro', 'nome': 'X', 'papel': 'caixista'}); check(s == 403, 'financeiro não cria outros acessos')

print('== consulta com só crediário (vendas zeradas): cria a sacola do mesmo jeito (sacola agora carrega venda e/ou crediário)')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-08', 'periodoFim': '2026-10-08'}); JOB2 = r.get('id')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB2, 'resultado': {'porFilial': {'1': {'vendasDinheiro': 0, 'recebCrediario': 50}}}}); check(s == 200, 'resultado só com crediário (sem venda em dinheiro no período)')
s, st = A.req('/api/caixa/state'); sac_cr = next(sc for sc in st['sacolas'] if sc['periodoIni'] == '2026-10-08')
check(sac_cr['valorStaria'] == 0 and sac_cr['crediStaria'] == 50 and not sac_cr['precisaChegar'] and sac_cr['chegouEm'] is not None, 'cria a sacola da matriz mesmo só com crediário, já pronta pra conferência (sem venda em dinheiro no StarIA)')
check(not any(m.get('periodoIni') == '2026-10-08' for m in st['mov']), 'nenhum lançamento ainda: só a conferência decide o que entra no caixa')
s, r = F.req('/api/caixa/sacola/conferir', {'id': sac_cr['id'], 'valorContado': '0', 'crediCartao': '50'})
check(s == 200 and r.get('diferenca') == 0 and r.get('crediDiferenca') == 0, 'financeiro confere: os 50 de crediário foram recebidos em cartão (não em dinheiro) — bate com o StarIA, mas não entra no caixa')
s, st = A.req('/api/caixa/state')
check(not any(m.get('periodoIni') == '2026-10-08' for m in st['mov']), 'crediário em cartão não gera lançamento nenhum: só o que é dinheiro entra no caixa')

print('== relatório por filial e consolidado')
s, st = A.req('/api/caixa/state'); pf = st['porFilial']
check(pf['1']['vendas'] == 8000 and pf['1']['crediario'] == 500, 'filial 1: vendas 8.000 + crediário em dinheiro 500 (o cartão de 50 da outra consulta não conta aqui)')
check(pf['2']['vendas'] == 3000 and pf['2']['crediario'] == 0, 'filial 2: vendas 3.000, sem crediário')
check(pf['3']['vendas'] == 1500 and pf['3']['crediario'] == 200, 'filial 3: vendas 1.500 + crediário em dinheiro 200')
total_pf = sum(v['vendas'] + v['crediario'] for v in pf.values())
check(total_pf == 13200, 'soma das filiais (13.200 = 8.500+3.000+1.700) bate com o crediário em dinheiro decidido nas conferências')
check(st['saldo'] == 27700, 'saldo consolidado continua um só: 27.700 (relatório por filial não muda o caixa físico)')

print('== gaveta de impostos e financiamentos (só o admin)')
s, _ = M.req('/api/caixa/sangria', {'valor': '1000', 'data': '2026-10-09', 'motivo': 'Imposto', 'destino': 'impostos'}); check(s == 403, 'caixista não lança sangria para a gaveta de impostos')
s, r = A.req('/api/caixa/sangria', {'valor': '1000', 'data': '2026-10-09', 'motivo': 'Imposto 1', 'destino': 'impostos'}); SGI1 = r.get('id'); check(s == 200 and SGI1, 'admin lança sangria destino=impostos')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 1000, 'saldo da gaveta: R$ 1.000')
check(st['saldo'] == 26700, 'saldo principal cai do mesmo jeito: 27.700 − 1.000 = 26.700')
s, stm = M.req('/api/caixa/state'); check('saldoImpostos' not in stm and 'movImpostos' not in stm, 'caixista não vê a gaveta de impostos')
s, stf = F.req('/api/caixa/state'); check('saldoImpostos' not in stf and 'movImpostos' not in stf, 'financeiro não vê a gaveta de impostos')
sgi1_principal = next(m for m in st['mov'] if m['id'] == SGI1)
check(sgi1_principal['destino'] == 'impostos', 'a sangria aparece no extrato principal do admin, marcada com o destino')
sgi1_caixista = next(m for m in stm['mov'] if m['id'] == SGI1)
check('destino' not in sgi1_caixista and 'parId' not in sgi1_caixista, 'caixista vê a mesma sangria, mas sem destino nem parId (não sabe que a gaveta existe)')
s, _ = M.req('/api/caixa/gaveta-saida', {'valor': '100', 'data': '2026-10-09', 'motivo': 'x'}); check(s == 403, 'caixista não lança saída da gaveta')
s, r = A.req('/api/caixa/gaveta-saida', {'valor': '400', 'data': '2026-10-09', 'motivo': 'Pagamento do DAS'}); GS1 = r.get('id'); check(s == 200 and GS1, 'admin lança saída da gaveta (pagou um imposto)')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 600, 'saldo da gaveta cai com a saída: 1.000 − 400 = 600')
check(st['saldo'] == 26700, 'saída da gaveta não muda o saldo principal')
s, r = A.req('/api/caixa/sangria', {'valor': '300', 'data': '2026-10-10', 'motivo': 'Imposto 2', 'destino': 'impostos'}); SGI2 = r.get('id'); check(s == 200, 'admin lança outra sangria destino=impostos')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 900 and st['saldo'] == 26400, 'gaveta sobe pra 900, principal cai pra 26.400')
s, _ = A.req('/api/caixa/mov/excluir', {'id': SGI2}); check(s == 200, 'admin apaga a sangria 2 (o dinheiro dela ainda não foi usado na gaveta)')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 600 and st['saldo'] == 26700, 'apagar desfaz os dois lados: gaveta volta a 600, principal volta a 26.700')
s, _ = A.req('/api/caixa/mov/excluir', {'id': SGI1}); check(s == 409, 'não deixa apagar a sangria 1: os 1.000 dela já foram usados (só sobra 600 na gaveta)')
s, _ = A.req('/api/caixa/mov/excluir', {'id': GS1}); check(s == 200, 'admin apaga a saída de 400 (devolve pra gaveta)')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 1000, 'gaveta volta a 1.000, com os 400 de volta')
s, _ = A.req('/api/caixa/mov/excluir', {'id': SGI1}); check(s == 200, 'agora dá para apagar a sangria 1: os 1.000 continuam disponíveis na gaveta')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 0 and st['saldo'] == 27700, 'gaveta zerada, saldo principal de volta a 27.700')

print('== conferência física do caixa e ocorrências')
s, r = F.req('/api/caixa/conferir', {'valorContado': '27700'}); check(s == 200 and r.get('diferenca') == 0, 'financeiro também confere o caixa físico, do mesmo jeito que o caixista')
s, _ = M.req('/api/caixa/conferir', {'valorContado': '-5'}); check(s == 400, 'valor contado negativo recusado')
s, r = M.req('/api/caixa/conferir', {'valorContado': '27700'}); check(s == 200 and r.get('diferenca') == 0, 'caixista confere e bate certinho (27.700 = 27.700)')
s, _ = M.req('/api/caixa/ocorrencias'); check(s == 403, 'caixista não vê a aba de ocorrências')
s, _ = F.req('/api/caixa/ocorrencias'); check(s == 403, 'financeiro não vê a aba de ocorrências')
s, oc = A.req('/api/caixa/ocorrencias'); check(s == 200 and not any(o['tipo'] == 'conferencia' for o in oc['ocorrencias']), 'conferência que bateu NÃO vira ocorrência')
s, r = M.req('/api/caixa/conferir', {'valorContado': '27500', 'motivo': 'Nota estranha na gaveta'}); check(s == 200 and r.get('diferenca') == -200, 'caixista confere e falta R$ 200 (27.500 − 27.700)')
s, oc = A.req('/api/caixa/ocorrencias'); confs = [o for o in oc['ocorrencias'] if o['tipo'] == 'conferencia']
check(s == 200 and len(confs) == 1, 'conferência com diferença já aparece nas ocorrências do admin')
check(confs[0]['detalhe']['diferenca'] == -200 and confs[0]['detalhe']['motivo'] == 'Nota estranha na gaveta' and confs[0]['detalhe']['por'] == 'Menina do caixa', 'ocorrência traz a diferença, o motivo e quem conferiu')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == 27700, 'conferir nunca muda o saldo (só registra o que foi contado)')
check('ocorrencias' in st, 'o estado do admin já vem com as ocorrências (sem precisar de outra chamada)')
s, stm = M.req('/api/caixa/state'); check('ocorrencias' not in stm, 'caixista não recebe as ocorrências no próprio estado')

s, r = A.req('/api/caixa/ajuste', {'valor': '50', 'data': '2026-10-10', 'motivo': 'sobra de caixa'}); AJ1 = r.get('id')
s, _ = A.req('/api/caixa/mov/excluir', {'id': AJ1}); check(s == 200, 'admin apaga o próprio ajuste (mesmo com a senha dele, fica registrado)')
s, oc = A.req('/api/caixa/ocorrencias'); titulos = [o['titulo'] for o in oc['ocorrencias']]
check('Ajuste lançado' in titulos and 'Lançamento apagado' in titulos, 'ajuste e exclusão do admin aparecem nas ocorrências, mesmo sendo ele mesmo quem fez')

print('== sacola com diferença de vendas E de crediário: financeiro confere, as duas diferenças aparecem em ocorrências; sacola não confirmada continua "na filial"')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-11', 'periodoFim': '2026-10-11'}); JOB_SAC = r.get('id')
RES_SAC = {'porFilial': {'1': {'vendasDinheiro': 1000, 'recebCrediario': 100}, '2': {'vendasDinheiro': 300, 'recebCrediario': 0}}}
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB_SAC, 'resultado': RES_SAC}); check(s == 200, 'resultado com venda e crediário: cria as duas sacolas, sem lançamento nenhum ainda (só a conferência decide)')
s, st = A.req('/api/caixa/state'); sacsc = [sc for sc in st['sacolas'] if sc['jobId'] == JOB_SAC]
sac_f1 = next(sc for sc in sacsc if sc['filial'] == 1); sac_f2 = next(sc for sc in sacsc if sc['filial'] == 2)
check(not sac_f1['precisaChegar'] and sac_f1['chegouEm'] is not None, 'a sacola da matriz (filial 1) já nasce pronta pra conferir')
check(st['miniCaixas']['1']['aguardandoConferencia'] == 1100 and st['miniCaixas']['2']['naFilial'] == 300, 'mini caixa: matriz já "aguardando conferência" (1.000+100), filial 2 ainda "na filial" (300)')
s, _ = A.req('/api/caixa/sacola/conferir', {'id': sac_f2['id'], 'valorContado': '300'}); check(s == 409, 'não dá pra conferir a sacola 2 sem ela ter chegado na matriz')
s, _ = M.req('/api/caixa/sacola/conferir', {'id': sac_f1['id'], 'valorContado': '800'}); check(s == 403, 'caixista não confere sacola, chegada ou não')
s, r = F.req('/api/caixa/sacola/chegou', {'id': sac_f1['id']}); check(s == 200 and r.get('jaChegou'), 'financeiro também pode marcar a chegada, mas a da matriz já chegou sozinha (idempotente)')
s, r = F.req('/api/caixa/sacola/conferir', {'id': sac_f1['id'], 'valorContado': '800', 'crediDinheiro': '50', 'crediCartao': '30', 'motivo': 'Sobrou menos que o esperado'})
check(s == 200 and r.get('diferenca') == -200 and r.get('crediDiferenca') == -20, 'financeiro confere: faltam R$ 200 de venda (800 − 1.000) e R$ 20 de crediário (50+30 − 100)')
s, st = A.req('/api/caixa/state')
mvsc = next(m for m in st['mov'] if m['tipo'] == 'venda_staria' and m['periodoIni'] == '2026-10-11' and (m.get('detalhe') or {}).get('porFilial', {}).get('1'))
crmvsc = next(m for m in st['mov'] if m['tipo'] == 'crediario_staria' and m['periodoIni'] == '2026-10-11')
check(mvsc['valor'] == 800, 'o lançamento de venda usa o valor REAL contado na matriz (800), não o do StarIA (1.000)')
check(crmvsc['valor'] == 50 and crmvsc['status'] == 'aprovado', 'o lançamento de crediário usa só a parte em dinheiro decidida pelo financeiro (50), já aprovado direto')
check(st['saldo'] == 27700 + 800 + 50, 'saldo sobe com o valor real de venda e o crediário em dinheiro: 27.700 + 800 + 50 = 28.550')
check('1' not in st['miniCaixas'], 'mini caixa da filial 1 some depois de conferida')
check(st['miniCaixas']['2']['naFilial'] == 300, 'a sacola 2 ainda não chegou nem foi conferida: continua aparecendo como dinheiro lá na outra filial, até alguém dar o ok')
s, _ = F.req('/api/caixa/sacola/conferir', {'id': sac_f1['id'], 'valorContado': '800'}); check(s == 409, 'financeiro não confere a mesma sacola duas vezes')
s, oc = A.req('/api/caixa/ocorrencias'); sacsOc = [o for o in oc['ocorrencias'] if o['tipo'] == 'sacola']
check(len(sacsOc) == 1 and sacsOc[0]['detalhe']['filial'] == 1 and sacsOc[0]['detalhe']['diferenca'] == -200 and sacsOc[0]['detalhe']['crediDiferenca'] == -20
      and sacsOc[0]['detalhe']['crediStaria'] == 100 and sacsOc[0]['detalhe']['crediDinheiro'] == 50 and sacsOc[0]['detalhe']['crediCartao'] == 30
      and sacsOc[0]['detalhe']['motivo'] == 'Sobrou menos que o esperado' and sacsOc[0]['detalhe']['por'] == 'Fulano do financeiro' and sacsOc[0]['detalhe']['role'] == 'financeiro',
      'a diferença da sacola aparece em ocorrências, com a filial, as diferenças de venda e de crediário, o motivo e quem conferiu')

print('== acesso de automação (StarIA): só pede e entrega a consulta, nada mais')
s, r = A.req('/api/caixa/pessoa', {'login': 'automacao1', 'papel': 'automacao', 'senha': 'curta1'}); check(s == 400, 'senha curta demais para o acesso de automação é recusada')
SENHA_AUTO = 'AutoStaria2026x9'
s, r = A.req('/api/caixa/pessoa', {'login': 'automacao1', 'papel': 'automacao', 'senha': SENHA_AUTO}); check(s == 200 and r.get('login') == 'automacao1' and not r.get('password'), 'cria o acesso de automação com a senha escolhida pelo admin (sem gerar provisória)')
AU = C(TID)
s, _ = AU.req('/api/login', {'role': 'admin', 'login': 'automacao1', 'password': SENHA_AUTO}); check(s == 200, 'acesso de automação entra direto, sem precisar trocar senha')
s, _ = AU.req('/api/caixa/state'); check(s == 403, 'acesso de automação não vê o estado do caixa')
s, _ = AU.req('/api/caixa/ocorrencias'); check(s == 403, 'acesso de automação não vê as ocorrências')
s, _ = AU.req('/api/caixa/ajuste', {'valor': '10', 'data': '2026-10-10', 'motivo': 'x'}); check(s == 403, 'acesso de automação não lança nada além do StarIA')
s, r = AU.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-09', 'periodoFim': '2026-10-09'}); JOB3 = r.get('id'); check(s == 200 and JOB3, 'acesso de automação pede a consulta ao StarIA')
s, _ = AU.req('/api/caixa/staria/resultado', {'id': JOB3, 'resultado': {'porFilial': {'1': {'vendasDinheiro': 500, 'recebCrediario': 0}}}}); check(s == 200, 'acesso de automação entrega o resultado, que já é aplicado direto em sacolas (quem revisa agora é o financeiro, sacola por sacola)')
s, oc = A.req('/api/caixa/ocorrencias'); titulos3 = [o['titulo'] for o in oc['ocorrencias']]
check('Consulta ao StarIA pedida' in titulos3 and 'Consulta ao StarIA aplicada, em sacolas por filial' in titulos3, 'a consulta pedida e entregue pela automação aparece nas ocorrências do admin')
s, st3 = A.req('/api/caixa/state'); autos = [p for p in st3['pessoas'] if p['papel'] == 'automacao']
check(len(autos) == 1 and autos[0]['login'] == 'automacao1', 'admin vê o acesso de automação na lista de acessos')

print('== desativar e reativar a pessoa; nova senha provisória')
s, _ = A.req('/api/caixa/pessoa', {'login': 'caixista1', 'nome': 'Menina do caixa', 'ativo': False}); check(s == 200, 'admin desativa o acesso da caixista')
s, _ = M.req('/api/caixa/state'); check(s == 401, 'caixista desativada perde a sessão imediatamente')
s, _ = A.req('/api/login', {'role': 'admin', 'login': 'caixista1', 'password': NPC}); check(s == 401, 'login da caixista desativada é recusado')
s, r = A.req('/api/caixa/pessoa', {'login': 'caixista1', 'nome': 'Menina do caixa', 'ativo': True, 'novaSenha': True}); SENHA1 = r.get('password')
check(s == 200 and SENHA1 and SENHA1 != SENHA0, 'admin reativa e gera uma nova senha provisória')
M2 = C(TID); s, me3 = M2.req('/api/login', {'role': 'admin', 'login': 'caixista1', 'password': SENHA1}); check(s == 200 and me3.get('mustReset'), 'caixista entra de novo com a nova senha provisória')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails:
    print('\nFALHAS:')
    for f in fails: print(' -', f)
    sys.exit(1)

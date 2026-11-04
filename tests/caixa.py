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
s, mf = C(None).req('/api/manifest?t=' + TID); check(s == 200 and mf.get('name') == 'Dávila Supermercados Painel', 'app instalado no celular tem nome próprio')

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
s, _ = M.req('/api/caixa/depositado', {'id': SG1, 'depositadoEm': '2026-10-05'}); check(s == 403, 'caixista NÃO confirma o banco: quem tira o dinheiro não confirma que ele chegou')
s, _ = A.req('/api/caixa/depositado', {'id': SG1, 'depositadoEm': '2026-10-05'}); check(s == 200, 'o dono confirma no banco (olhando o extrato)')
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
s, r = A.req('/api/caixa/staria/pedir', {'dia': '2026-10-07'}); JOB = r.get('id')
check(s == 200 and JOB and r['periodoIni'] == r['periodoFim'] == '2026-10-07', 'admin pede a consulta de um dia (07/10)')
s, r = A.req('/api/caixa/staria/pedir', {'dia': '2026-10-07'}); check(s == 200 and r.get('jaPedido') is True and r['id'] == JOB, 'pedir de novo o mesmo dia (ainda pendente) não cria outra: avisa que já está pedido')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-01', 'periodoFim': '2026-10-07'}); check(s == 400, 'consulta de vários dias de uma vez é recusada (é sempre um dia só)')
s, r = A.req('/api/caixa/staria/pedir', {'dia': '2099-01-01'}); check(s == 400, 'dia no futuro recusado')
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
s, st = A.req('/api/caixa/state'); mvs = [m for m in st['mov'] if m['tipo'] == 'venda_staria' and m['periodoIni'] == '2026-10-07']
crmvs = [m for m in st['mov'] if m['tipo'] == 'crediario_staria' and m['periodoIni'] == '2026-10-07']
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
s, _ = F.req('/api/caixa/depositado', {'id': SGF, 'depositadoEm': '2026-10-08'}); check(s == 403, 'financeiro também não confirma o banco (só o dono)')
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
check(s == 200 and r.get('bateu') is True and 'diferenca' not in r, 'financeiro confere: os 50 de crediário foram recebidos em cartão (não em dinheiro) — bate com o StarIA (ele só fica sabendo que bateu, não o valor)')
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
check(all(m['id'] != SGI1 for m in stm['mov']) and all('destino' not in m and 'parId' not in m for m in stm['mov']), 'caixista não vê a sangria do dono (só o que ela mesma lançou), nem destino/parId de nada')
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
s, r = F.req('/api/caixa/conferir', {'valorContado': '27700'}); check(s == 200 and r.get('bateu') is True and 'saldoEsperado' not in r and 'diferenca' not in r, 'financeiro também confere o caixa físico, às cegas: só fica sabendo que bateu')
s, _ = M.req('/api/caixa/conferir', {'valorContado': '-5'}); check(s == 400, 'valor contado negativo recusado')
s, r = M.req('/api/caixa/conferir', {'valorContado': '27700'}); check(s == 200 and r.get('bateu') is True, 'caixista confere e bate certinho (27.700 = 27.700)')
s, _ = M.req('/api/caixa/ocorrencias'); check(s == 403, 'caixista não vê a aba de ocorrências')
s, _ = F.req('/api/caixa/ocorrencias'); check(s == 403, 'financeiro não vê a aba de ocorrências')
s, oc = A.req('/api/caixa/ocorrencias'); check(s == 200 and not any(o['tipo'] == 'conferencia' for o in oc['ocorrencias']), 'conferência que bateu NÃO vira ocorrência')
s, r = M.req('/api/caixa/conferir', {'valorContado': '27500', 'motivo': 'Nota estranha na gaveta'}); check(s == 200 and r.get('bateu') is False and 'diferenca' not in r and 'saldoEsperado' not in r, 'caixista confere e falta R$ 200 (27.500 − 27.700): ela só sabe que não bateu, não quanto')
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
check(s == 200 and r.get('bateu') is False and 'diferenca' not in r, 'financeiro confere: faltam R$ 200 de venda (800 − 1.000) e R$ 20 de crediário (50+30 − 100); ele só sabe que não bateu')
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

print('== consulta por caixa (ECF) e por dia: o financeiro marca os conferidos no StarIA, só esses viram sacola')
NPC2 = pw(); s, _ = M2.req('/api/password', {'current': SENHA1, 'next': NPC2}); check(s == 200, 'caixista cria a senha dela de novo')
s, r = A.req('/api/caixa/staria/pedir', {'dia': '2026-10-30'}); JL = r.get('id'); check(s == 200 and JL, 'pede a consulta por caixa')
def lin(f, e, d, v): return {'filial': f, 'ecf': e, 'data': d, 'dinheiro': v}
s, _ = A.req('/api/caixa/staria/resultado', {'id': JL, 'resultado': {'linhas': [lin(2, '1 01', '2026-10-29', 10)]}}); check(s == 400, 'caixa (ECF) com espaço recusado')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JL, 'resultado': {'linhas': [lin(2, '101', '2026-10-29', 10), lin(2, '101', '2026-10-29', 20)]}}); check(s == 400, 'mesmo caixa repetido no mesmo dia recusado')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JL, 'resultado': {'linhas': [lin(2, '101', '2099-01-01', 10)]}}); check(s == 400, 'dia no futuro recusado')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JL, 'resultado': {'linhas': [lin(2, '101', '2026-10-29', -1)]}}); check(s == 400, 'dinheiro negativo recusado')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JL, 'resultado': {'linhas': [lin(0, '101', '2026-10-29', 1)]}}); check(s == 400, 'filial 0 recusada')
s, st_a = A.req('/api/caixa/state'); n_sac_antes = len(st_a['sacolas']); saldo_a = st_a['saldo']
LINHAS1 = [lin(2, '101', '2026-10-29', 100), lin(2, '102', '2026-10-29', '200.5'), lin(2, '101', '2026-10-30', 300), lin(1, '201', '2026-10-30', 50), lin(3, '301', '2026-10-30', 0)]
s, r = A.req('/api/caixa/staria/resultado', {'id': JL, 'resultado': {'linhas': LINHAS1}})
check(s == 200 and r.get('linhas') == 4 and r.get('novas') == 4 and r.get('total') == 650.5, 'entrega por caixa: 4 caixas com dinheiro (o de R$ 0 é ignorado), total 650,50 (%s)' % r)
s, st = A.req('/api/caixa/state'); cp = st.get('caixasPendentes', [])
check(len(cp) == 4 and len(st['sacolas']) == n_sac_antes and st['saldo'] == saldo_a, 'os caixas ficam esperando: nenhuma sacola nova e o saldo não muda')
def cx(lista, f, e, d): return next((l for l in lista if l['filial'] == f and l['ecf'] == e and l['data'] == d), None)
check(cx(cp, 2, '102', '2026-10-29')['dinheiro'] == 200.5, 'cada caixa com o dinheiro dele')
s, stf = F.req('/api/caixa/state'); check(len(stf.get('caixasPendentes', [])) == 4, 'o financeiro vê os caixas para marcar')
s, stm = M2.req('/api/caixa/state'); check(s == 200 and 'caixasPendentes' not in stm, 'a caixista não vê a lista (não é ela quem marca)')
IDS = [cx(cp, 2, '101', '2026-10-29')['id'], cx(cp, 2, '102', '2026-10-29')['id'], cx(cp, 1, '201', '2026-10-30')['id']]
s, _ = M2.req('/api/caixa/caixas/aceitar', {'ids': IDS}); check(s == 403, 'caixista não envia caixas para a sacola')
s, _ = AU.req('/api/caixa/caixas/aceitar', {'ids': IDS}); check(s == 403, 'automação não envia caixas para a sacola')
s, _ = F.req('/api/caixa/caixas/aceitar', {'ids': []}); check(s == 400, 'sem nenhum caixa marcado, recusa')
s, _ = F.req('/api/caixa/caixas/aceitar', {'ids': ['lffffffffffffffff']}); check(s == 404, 'caixa que não existe, recusa')
s, r = F.req('/api/caixa/caixas/aceitar', {'ids': IDS})
sacs = {x['filial']: x for x in r.get('sacolas', [])}
check(s == 200 and r.get('caixas') == 3 and sacs.get(2, {}).get('total') == 300.5 and sacs.get(1, {}).get('total') == 50, 'financeiro envia 3 caixas: vira uma sacola por filial (filial 2: 300,50; matriz: 50) (%s)' % r)
s, _ = F.req('/api/caixa/caixas/aceitar', {'ids': IDS}); check(s == 409, 'os mesmos caixas não entram duas vezes')
s, st = A.req('/api/caixa/state'); cp = st['caixasPendentes']
check(len(cp) == 1 and cp[0]['ecf'] == '101' and cp[0]['data'] == '2026-10-30', 'só o caixa não marcado continua esperando')
s2 = next(x for x in st['sacolas'] if x['id'] == sacs[2]['id']); s1 = next(x for x in st['sacolas'] if x['id'] == sacs[1]['id'])
check(not s2['chegouEm'] and s2['valorStaria'] == 300.5 and sorted(c['ecf'] for c in s2['caixas']) == ['101', '102'], 'a sacola da filial 2 ainda está na filial e diz de quais caixas veio')
check(s1['chegouEm'] and s1['valorStaria'] == 50, 'a sacola da matriz já nasce pronta para conferir')
check(st['saldo'] == saldo_a, 'enviar para a sacola ainda não mexe no saldo (só a conferência)')
s, r = A.req('/api/caixa/staria/pedir', {'dia': '2026-10-30'}); JL2 = r.get('id')
s, r = A.req('/api/caixa/staria/resultado', {'id': JL2, 'resultado': {'linhas': [lin(2, '101', '2026-10-30', 310), lin(2, '101', '2026-10-29', 999), lin(2, '103', '2026-10-30', 80)]}})
check(s == 200 and r.get('novas') == 1 and r.get('atualizadas') == 1 and r.get('jaAceitas') == 1, 'nova consulta do mesmo período: atualiza o que espera, ignora o que já foi para a sacola, traz o novo (%s)' % r)
s, st = A.req('/api/caixa/state'); cp = st['caixasPendentes']
check(cx(cp, 2, '101', '2026-10-30')['dinheiro'] == 310 and cx(cp, 2, '103', '2026-10-30')['dinheiro'] == 80 and cx(cp, 2, '101', '2026-10-29') is None, 'caixa esperando teve o valor atualizado; o que já está na sacola não voltou')
s2 = next(x for x in st['sacolas'] if x['id'] == sacs[2]['id']); check(s2['valorStaria'] == 300.5, 'a sacola não mudou com a nova consulta')
# um cliente pagou R$ 20 de crediário na matriz em 30/10, em dinheiro: vem do StarIA, o financeiro marca a forma
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-30', 'periodoFim': '2026-10-30'}); JCR0 = r['id']
A.req('/api/caixa/staria/resultado', {'id': JCR0, 'resultado': {'crediario': [{'filial': 1, 'data': '2026-10-30', 'numero': '900', 'cliente': 'Cliente da matriz', 'valor': 20, 'conta': 'CONVENIOS', 'tipo': 'CONVENIO'}]}})
s, st = F.req('/api/caixa/state'); c900 = next(c for c in st['crediarios'] if c['numero'] == '900')
s, _ = F.req('/api/caixa/credi/forma', {'itens': [{'id': c900['id'], 'forma': 'dinheiro'}]}); check(s == 200, 'financeiro marca o crediário da matriz como dinheiro')
s, r = F.req('/api/caixa/sacola/conferir', {'id': sacs[1]['id'], 'valorContado': '50', 'crediDinheiro': '20'})
check(s == 200 and r.get('bateu') is True, 'conferir a sacola da matriz: venda bateu e o crediário em dinheiro (20) bateu com o que foi marcado')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == round(saldo_a + 70, 2), 'saldo sobe com a venda contada (50) e o crediário em dinheiro (20); o cartão não entra')
F.req('/api/caixa/sacola/chegou', {'id': sacs[2]['id']})
s, r = F.req('/api/caixa/sacola/conferir', {'id': sacs[2]['id'], 'valorContado': '300', 'motivo': 'faltou 50 centavos'}); check(s == 200 and r.get('bateu') is False, 'sacola da filial 2 conferida: faltaram 50 centavos')
s, oc = A.req('/api/caixa/ocorrencias'); tt = [o['titulo'] for o in oc['ocorrencias']]
check('Caixas do StarIA enviados para a sacola' in tt, 'enviar caixas para a sacola aparece nas ocorrências')
sac_oc = [o for o in oc['ocorrencias'] if o['tipo'] == 'sacola']
check(any(o['detalhe']['diferenca'] == -0.5 for o in sac_oc) and not any(o['detalhe']['filial'] == 1 and o['detalhe']['valorContado'] == 50 for o in sac_oc), 'só a sacola com falta vira ocorrência (a da matriz bateu)')
s, st = A.req('/api/caixa/state'); j = next(x for x in st['jobs'] if x['id'] == JL); check(j['resultado'].get('porCaixa') is True and j['status'] == 'aplicada', 'a consulta mostra o resumo por caixa')

print('== "quanto eu tenho agora e está tudo certo?": resumo do dono, contagem cega da equipe, alertas')
s, st = A.req('/api/caixa/state'); rs = st.get('resumo', {})
check(rs.get('naMatriz') == st['saldo'] and rs.get('status') in ('verde', 'amarelo', 'vermelho') and isinstance(rs.get('alertas'), list), 'o dono recebe o resumo: dinheiro na matriz, semáforo e alertas')
check(round(rs['naMatriz'] + rs['nasLojas']['total'] + rs['aCaminhoDoBanco']['total'] + rs['gaveta'], 2) == rs['tudo'], '"tudo que é seu" = matriz + nas lojas + a caminho do banco + gaveta')
check(rs['nasLojas']['total'] >= 390, 'caixas do StarIA ainda esperando contam em "nas lojas" (310 + 80)')
cods = [a['codigo'] for a in rs['alertas']]
import datetime as _dt
_d5 = (_dt.datetime.utcnow() - _dt.timedelta(hours=3) - _dt.timedelta(days=5)).strftime('%Y-%m-%d')
s, r = F.req('/api/caixa/sangria', {'valor': '700', 'data': _d5, 'motivo': 'Depósito no banco'}); SGB = r.get('id')
s, st = A.req('/api/caixa/state'); rs = st['resumo']; cods = [a['codigo'] for a in rs['alertas']]
check('SANGRIA_SEM_BANCO' in cods and rs['aCaminhoDoBanco']['qtd'] == 1 and rs['aCaminhoDoBanco']['total'] == 700, 'sangria da equipe há 5 dias que o dono ainda não confirmou no banco vira alerta (%s)' % rs['aCaminhoDoBanco'])
s, _ = A.req('/api/caixa/depositado', {'id': SGB, 'depositadoEm': _d5}); s, st = A.req('/api/caixa/state')
check('SANGRIA_SEM_BANCO' not in [a['codigo'] for a in st['resumo']['alertas']] and st['resumo']['aCaminhoDoBanco']['qtd'] == 0, 'depois que o dono confirma no banco, o alerta some')
rs = st['resumo']; cods = [a['codigo'] for a in rs['alertas']]
check('COFRE_DIFERENCA' in cods, 'a última contagem do cofre com falta vira alerta')
check('CAIXA_VERMELHO' in cods, 'caixa do StarIA esperando há dias vira alerta')
check(rs['status'] == 'vermelho' and rs['alertas'][0]['nivel'] == 'vermelho', 'com alerta vermelho, o semáforo fica vermelho e o vermelho vem primeiro')
check(rs['ultimaContagem'] and rs['ultimaContagem']['diferenca'] == -200, 'mostra a última contagem do cofre e quanto deu de diferença')
s, stf = F.req('/api/caixa/state')
check('saldo' not in stf and 'resumo' not in stf and 'porFilial' not in stf and 'miniCaixas' not in stf, 'o financeiro não vê o saldo nem o resumo (contagem cega)')
check(all(c['dinheiro'] is None for c in stf.get('caixasPendentes', [])) and all(sc['valorStaria'] is None for sc in stf['sacolas']), 'o financeiro não vê o valor dos caixas nem das sacolas que vai contar')
check(isinstance(stf.get('pendencias'), list) and all('R$' not in p['texto'] for p in stf['pendencias']), 'o financeiro vê as pendências dele, sem valores em R$')
check(all(m['criadoPor'] == 'Fulano do financeiro' for m in stf['mov']), 'o financeiro só vê no extrato o que ele mesmo lançou')
s, stm = M2.req('/api/caixa/state'); check('saldo' not in stm and 'caixasPendentes' not in stm, 'a caixista também não vê o saldo')
s, r = A.req('/api/caixa/conferir', {'valorContado': '1'}); check(s == 200 and 'saldoEsperado' in r and r['bateu'] is False, 'o dono, quando conta, vê o esperado e a diferença')
print('== checar a sacola antes de confirmar (sem gravar, no máximo 2 vezes)')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-31', 'periodoFim': '2026-10-31'}); JCH = r['id']
A.req('/api/caixa/staria/resultado', {'id': JCH, 'resultado': {'linhas': [lin(1, '205', '2026-10-31', 120)]}})
s, st = A.req('/api/caixa/state'); idc = cx(st['caixasPendentes'], 1, '205', '2026-10-31')['id']
s, r = F.req('/api/caixa/caixas/aceitar', {'ids': [idc]}); SCH = r['sacolas'][0]['id']
s, _ = M2.req('/api/caixa/sacola/checar', {'id': SCH, 'valorContado': '120'}); check(s == 403, 'caixista não checa sacola')
s, r = F.req('/api/caixa/sacola/checar', {'id': SCH, 'valorContado': '100'}); check(s == 200 and r['bateu'] is False and 'diferenca' not in r, '1ª checagem: não bateu (sem dizer quanto falta)')
s, r = F.req('/api/caixa/sacola/checar', {'id': SCH, 'valorContado': '120'}); check(s == 200 and r['bateu'] is True, '2ª checagem: recontou e bateu')
s, _ = F.req('/api/caixa/sacola/checar', {'id': SCH, 'valorContado': '120'}); check(s == 429, '3ª checagem recusada: ninguém fica chutando até acertar')
s, st = A.req('/api/caixa/state'); check(next(x for x in st['sacolas'] if x['id'] == SCH)['conferidoEm'] is None, 'checar não grava nada: a sacola continua sem conferência')
s, r = F.req('/api/caixa/sacola/conferir', {'id': SCH, 'valorContado': '120'}); check(s == 200 and r['bateu'] is True, 'depois de checar, confirma a conferência normalmente')
print('== "Atualizar números do StarIA": últimos 7 dias até ontem, sem erro se já pedido')
import datetime as _dt2
_ontem = (_dt2.datetime.utcnow() - _dt2.timedelta(hours=3) - _dt2.timedelta(days=1)).strftime('%Y-%m-%d')
_3dias = (_dt2.datetime.utcnow() - _dt2.timedelta(hours=3) - _dt2.timedelta(days=3)).strftime('%Y-%m-%d')
_hoje = (_dt2.datetime.utcnow() - _dt2.timedelta(hours=3)).strftime('%Y-%m-%d')
s, r = A.req('/api/caixa/staria/pedir', {'auto': True}); check(s == 200 and r.get('id') and r['periodoIni'] == r['periodoFim'] == _ontem and not r.get('jaPedido'), 'o botão do Início pede só ONTEM (%s a %s)' % (r.get('periodoIni'), r.get('periodoFim')))
s, r3 = A.req('/api/caixa/staria/pedir', {'diasAtras': 3}); check(s == 200 and r3['periodoIni'] == r3['periodoFim'] == _3dias, '"3 dias atrás" pede só aquele dia')
s, r0 = A.req('/api/caixa/staria/pedir', {'diasAtras': 0}); check(s == 200 and r0['periodoIni'] == _hoje, '"hoje" também pode (um dia só)')
s, _ = A.req('/api/caixa/staria/pedir', {'diasAtras': -1}); check(s == 400, 'dias atrás negativo recusado')
s, r2_ = A.req('/api/caixa/staria/pedir', {'auto': True}); check(s == 200 and r2_.get('jaPedido') is True and r2_['id'] == r['id'], 'apertar de novo não dá erro: avisa que já está pedido')
s, _ = F.req('/api/caixa/staria/pedir', {'auto': True}); check(s == 403, 'financeiro não pede consulta')

print('== crediário recebido, um por um: o financeiro marca a forma, o dinheiro é contado na sacola, o dono confere Pix/cartão no banco')
_dc = (_dt.datetime.utcnow() - _dt.timedelta(hours=3) - _dt.timedelta(days=5)).strftime('%Y-%m-%d')
def cr(n, cli, v, conta='CONVENIOS'): return {'filial': 2, 'data': _dc, 'numero': n, 'cliente': cli, 'valor': v, 'conta': conta, 'tipo': 'CONVENIO'}
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': _dc, 'periodoFim': _dc}); JCR = r['id']
s, _ = A.req('/api/caixa/staria/resultado', {'id': JCR, 'resultado': {'crediario': [cr('1', 'X', -5)]}}); check(s == 400, 'crediário com valor negativo recusado')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JCR, 'resultado': {'crediario': [dict(cr('1', 'X', 5), data='2099-01-01')]}}); check(s == 400, 'crediário com data no futuro recusado')
CRED = [cr('7001', 'Ana Paula', 300), cr('7002', 'Bruno Lima', 150), cr('7003', 'Carla Dias', 200, 'CARTOES'), cr('7004', 'Davi Rocha', 120, 'SICOOB JOATUBA'), cr('7005', 'Eva Souza', 80), cr('7005', 'Eva Souza', 80)]
s, r = A.req('/api/caixa/staria/resultado', {'id': JCR, 'resultado': {'crediario': CRED}})
check(s == 200 and r.get('crediario') == 6 and r.get('crediNovos') == 6 and r.get('crediTotal') == 930, 'entrega os recebimentos de crediário um por um (o pagamento parcial repetido conta duas vezes) (%s)' % r)
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': _dc, 'periodoFim': _dc}); JCR2 = r['id']
s, r = A.req('/api/caixa/staria/resultado', {'id': JCR2, 'resultado': {'crediario': CRED}}); check(s == 200 and r.get('crediNovos') == 0, 'entregar de novo o mesmo dia não duplica nada')
s, stf = F.req('/api/caixa/state'); meus = [c for c in stf['crediarios'] if c['data'] == _dc and c['filial'] == 2]
check(len(meus) == 6 and all(c['valor'] > 0 and c['cliente'] for c in meus) and all('banco' not in c for c in meus), 'o financeiro vê cliente e valor para marcar a forma (mas não vê se o dono já conferiu no banco)')
s, stm = M2.req('/api/caixa/state'); check('crediarios' not in stm, 'a caixista não vê os recebimentos de crediário')
porNum = {}
for c in meus: porNum.setdefault(c['numero'], []).append(c['id'])
s, st = A.req('/api/caixa/state'); check('CREDI_SEM_FORMA' in [a['codigo'] for a in st['resumo']['alertas']], 'recebimento sem forma marcada há dias vira alerta')
s, _ = M2.req('/api/caixa/credi/forma', {'itens': [{'id': porNum['7001'][0], 'forma': 'dinheiro'}]}); check(s == 403, 'caixista não marca a forma')
s, _ = F.req('/api/caixa/credi/forma', {'itens': [{'id': porNum['7001'][0], 'forma': 'boleto'}]}); check(s == 400, 'forma inválida recusada')
FORMAS = [(porNum['7001'][0], 'dinheiro'), (porNum['7002'][0], 'dinheiro'), (porNum['7003'][0], 'cartao'), (porNum['7004'][0], 'pix'), (porNum['7005'][0], 'pix'), (porNum['7005'][1], 'outro')]
s, r = F.req('/api/caixa/credi/forma', {'itens': [{'id': i, 'forma': f} for i, f in FORMAS]}); check(s == 200 and r['alteradas'] == 6, 'financeiro marca a forma dos 6 de uma vez')
s, st = A.req('/api/caixa/state'); rs = st['resumo']; cods = [a['codigo'] for a in rs['alertas']]
check(rs['nasLojas']['porFilial']['2']['crediario'] == 450, 'o crediário em dinheiro (300 + 150) aparece como dinheiro nas lojas, ainda não contado')
check('CREDI_CONFERIR_BANCO' in cods and 'CREDI_SEM_FORMA' not in cods and 'CREDI_DINHEIRO_PARADO' in cods, 'alertas: Pix/cartão para o dono conferir, e dinheiro do crediário parado há dias')
s, _ = F.req('/api/caixa/credi/banco', {'ids': [porNum['7004'][0]], 'resultado': 'achei'}); check(s == 403, 'financeiro não confere no banco (só o dono)')
s, _ = A.req('/api/caixa/credi/banco', {'ids': [porNum['7001'][0]], 'resultado': 'achei'}); check(s == 409, 'dinheiro não se confere no banco (é contado na sacola)')
s, r = A.req('/api/caixa/credi/banco', {'ids': [porNum['7003'][0], porNum['7004'][0], porNum['7005'][1]], 'resultado': 'achei'}); check(s == 200 and r['conferidos'] == 3 and r['total'] == 400, 'o dono acha no extrato o cartão, o Pix e o "outro"')
s, r = A.req('/api/caixa/credi/banco', {'ids': [porNum['7005'][0]], 'resultado': 'nao_achei'}); check(s == 200, 'o dono não acha um Pix no banco')
s, st = A.req('/api/caixa/state'); al = [a for a in st['resumo']['alertas'] if a['codigo'] == 'CREDI_NAO_ACHEI']
check(al and al[0]['nivel'] == 'vermelho' and st['resumo']['status'] == 'vermelho', 'Pix que não caiu no banco vira alerta vermelho')
s, oc = A.req('/api/caixa/ocorrencias'); check(any(o['tipo'] == 'credi' and o['detalhe']['cliente'] == 'Eva Souza' and o['detalhe']['valor'] == 80 for o in oc['ocorrencias']), 'e fica nas ocorrências, com cliente e valor')
s, r = F.req('/api/caixa/credi/forma', {'itens': [{'id': porNum['7005'][0], 'forma': 'dinheiro'}]}); check(s == 200 and r['travadas'] == 1 and r['alteradas'] == 0, 'depois que o dono conferiu no banco, o financeiro não muda mais a forma')
s, r = A.req('/api/caixa/credi/banco', {'ids': [porNum['7005'][0]], 'resultado': 'achei'}); s2, st = A.req('/api/caixa/state')
check(s == 200 and 'CREDI_NAO_ACHEI' not in [a['codigo'] for a in st['resumo']['alertas']], 'achou depois (caiu atrasado): o dono corrige e o alerta some')
# a sacola da filial 2 daquele dia traz as vendas e o crediário em dinheiro (300 + 150)
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': _dc, 'periodoFim': _dc}); JCR3 = r['id']
A.req('/api/caixa/staria/resultado', {'id': JCR3, 'resultado': {'linhas': [lin(2, '105', _dc, 1000)]}})
s, st = A.req('/api/caixa/state'); saldo0 = st['saldo']; l105 = cx(st['caixasPendentes'], 2, '105', _dc)['id']
s, r = F.req('/api/caixa/caixas/aceitar', {'ids': [l105]}); SCR = r['sacolas'][0]['id']; F.req('/api/caixa/sacola/chegou', {'id': SCR})
s, r = F.req('/api/caixa/sacola/checar', {'id': SCR, 'valorContado': '1000', 'crediDinheiro': '400'}); check(s == 200 and r['bateu'] is False, 'checar: as vendas batem mas o crediário em dinheiro não (faltam 50)')
s, r = F.req('/api/caixa/sacola/checar', {'id': SCR, 'valorContado': '1000', 'crediDinheiro': '450'}); check(s == 200 and r['bateu'] is True, 'recontou: vendas 1.000 e crediário 450, bateu')
s, r = F.req('/api/caixa/sacola/conferir', {'id': SCR, 'valorContado': '1000', 'crediDinheiro': '450'}); check(s == 200 and r['bateu'] is True, 'confere a sacola com vendas e crediário')
s, st = A.req('/api/caixa/state')
check(st['saldo'] == round(saldo0 + 1450, 2) and st['resumo']['nasLojas']['porFilial'].get('2', {}).get('crediario', 0) == 0, 'o saldo sobe 1.450 e o crediário em dinheiro sai de "nas lojas"')
check(all(c['contado'] for c in st['crediarios'] if c['numero'] in ('7001', '7002')), 'os dois recebimentos em dinheiro ficam como contados (presos a essa sacola)')
s, r = F.req('/api/caixa/credi/forma', {'itens': [{'id': porNum['7001'][0], 'forma': 'pix'}]}); check(r['travadas'] == 1, 'dinheiro já contado não muda mais de forma')

print('== zerar os dados (recomeçar do zero): só o admin, com a senha dele e digitando ZERAR')
# a outra empresa de caixa ganha dados próprios, para provar que zerar uma não mexe na outra
s, r = cen.req('/api/central/tenant-admin', {'id': TX, 'login': 'donox'}); PX0 = r.get('password')
cen.req('/api/central/tenant', {'id': TX, 'status': 'ativa'})
X = C(TX); X.req('/api/login', {'role': 'admin', 'login': 'donox', 'password': PX0}); NPX = pw(); X.req('/api/password', {'current': PX0, 'next': NPX})
s, _ = X.req('/api/caixa/cfg', {'saldoInicial': '777', 'dataInicial': '2026-10-01'}); check(s == 200, 'a outra empresa configura o próprio saldo inicial')
s, st0 = A.req('/api/caixa/state'); check(st0['cfg'] is not None and len(st0['mov']) > 0 and len(st0['jobs']) > 0 and len(st0['sacolas']) > 0, 'antes de zerar: tem saldo inicial, lançamentos, consultas e sacolas')
s, _ = F.req('/api/caixa/zerar', {'senha': 'x', 'confirmacao': 'ZERAR'}); check(s == 403, 'financeiro não zera')
s, _ = AU.req('/api/caixa/zerar', {'senha': SENHA_AUTO, 'confirmacao': 'ZERAR'}); check(s == 403, 'acesso de automação não zera')
s, _ = A.req('/api/caixa/zerar', {'senha': NP, 'confirmacao': 'zera'}); check(s == 400, 'sem digitar ZERAR, recusa')
s, _ = A.req('/api/caixa/zerar', {'senha': NP + 'x', 'confirmacao': 'ZERAR'}); check(s == 400, 'senha errada, recusa')
SUPZ = C(TID); SUPZ.jar = cen.jar; SUPZ.op = cen.op
s, _ = SUPZ.req('/api/central/entrar', {'id': TID}); s, _ = SUPZ.req('/api/caixa/zerar', {'senha': NP, 'confirmacao': 'ZERAR'})
check(s == 403, 'acesso de suporte da Central não zera os dados da empresa (%s)' % s)
s, st1 = A.req('/api/caixa/state'); check(len(st1['mov']) == len(st0['mov']) and st1['cfg'] is not None, 'nada foi apagado pelas tentativas recusadas')
s, r = A.req('/api/caixa/zerar', {'senha': NP, 'confirmacao': 'zerar'})
ap = r.get('apagados', {})
check(s == 200 and ap.get('lancamentos', 0) > 0 and ap.get('consultas', 0) > 0 and ap.get('sacolas', 0) > 0 and ap.get('conferencias', 0) > 0 and ap.get('saldoInicial') == 1, 'admin zera (aceita "zerar" minúsculo) e diz quanto apagou: %s' % ap)
s, st2 = A.req('/api/caixa/state')
check(s == 200 and st2['cfg'] is None and st2['saldo'] == 0 and st2['mov'] == [] and st2['jobs'] == [] and st2['sacolas'] == [], 'depois de zerar: sem saldo inicial, sem lançamentos, sem consultas, sem sacolas (volta ao começo)')
check(ap.get('caixas', 0) > 0 and ap.get('crediarios', 0) > 0 and st2['caixasPendentes'] == [] and st2['crediarios'] == [], 'os caixas do StarIA (esperando ou já em sacola) também são apagados')
check(st2['saldoImpostos'] == 0 and st2['movImpostos'] == [] and st2['porFilial'] == {} and st2['miniCaixas'] in ([], {}), 'gaveta de impostos, relatório por filial e mini caixas zerados também')
check({p['login'] for p in st2['pessoas']} >= {'caixista1', 'financeiro1', 'automacao1'}, 'as pessoas e acessos continuam')
s, _ = F.req('/api/caixa/state'); check(s == 200, 'o financeiro continua entrando normalmente')
oc2 = st2.get('ocorrencias', [])
check(len(oc2) == 1 and oc2[0]['titulo'] == 'Dados do caixa zerados (recomeço do zero)' and oc2[0]['detalhe'].get('lancamentos') == ap.get('lancamentos'), 'ocorrências recomeçam: só aparece o próprio "zerar", com quanto foi apagado')
s, stx = X.req('/api/caixa/state'); check(s == 200 and stx['cfg'] is not None and stx['cfg']['saldoInicial'] == 777, 'a outra empresa continua com os dados dela')
s, _ = A.req('/api/caixa/cfg', {'saldoInicial': '100', 'dataInicial': '2026-11-01'}); s2, st3 = A.req('/api/caixa/state')
check(s == 200 and st3['saldo'] == 100, 'dá para recomeçar: configura o saldo inicial de novo')
for _ in range(5): A.req('/api/caixa/zerar', {'senha': 'errada' + pw(), 'confirmacao': 'ZERAR'})
s, _ = A.req('/api/caixa/zerar', {'senha': NP, 'confirmacao': 'ZERAR'}); check(s == 429, 'depois de 5 senhas erradas, bloqueia por 15 minutos (mesmo com a senha certa)')
s, st4 = A.req('/api/caixa/state'); check(st4['cfg'] is not None, 'o bloqueio não apagou nada')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails:
    print('\nFALHAS:')
    for f in fails: print(' -', f)
    sys.exit(1)

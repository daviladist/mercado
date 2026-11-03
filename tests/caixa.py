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

print('== consulta ao StarIA: pendente -> pronta (Claude) -> aplicada (admin revisa)')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-01', 'periodoFim': '2026-10-07'}); JOB = r.get('id')
check(s == 200 and JOB, 'admin pede a consulta de 01 a 07/10')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-01', 'periodoFim': '2026-10-07'}); check(s == 409, 'pedir de novo o mesmo período (ainda não aplicado) é recusado')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-07', 'periodoFim': '2026-10-01'}); check(s == 400, 'data final antes da inicial recusada')
s, st = A.req('/api/caixa/state'); job = next(j for j in st['jobs'] if j['id'] == JOB); check(job['status'] == 'pendente' and job['resultado'] is None, 'consulta fica pendente, aguardando o Claude')
s, _ = M.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': {'porFilial': {'1': {'vendasDinheiro': 100, 'recebCrediarioDinheiro': 0}}}}); check(s == 403, 'caixista não entrega resultado do StarIA (nem o Claude usaria essa conta)')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': {'porFilial': {'x': {'vendasDinheiro': 100, 'recebCrediarioDinheiro': 0}}}}); check(s == 400, 'filial inválida no resultado recusada')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': {'porFilial': {'1': {'vendasDinheiro': -5, 'recebCrediarioDinheiro': 0}}}}); check(s == 400, 'valor negativo no resultado recusado')
RES = {'porFilial': {'1': {'vendasDinheiro': 8000, 'recebCrediarioDinheiro': 500}, '2': {'vendasDinheiro': 3000, 'recebCrediarioDinheiro': 0}, '3': {'vendasDinheiro': 1500, 'recebCrediarioDinheiro': 200}}}
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': RES}); check(s == 200, 'resultado entregue: filiais 1, 2 e 3')
s, st = A.req('/api/caixa/state'); job = next(j for j in st['jobs'] if j['id'] == JOB)
check(job['status'] == 'pronta' and job['resultado']['total'] == 13200, 'consulta pronta: total 8.000+500+3.000+1.500+200 = 13.200, aguardando revisão')
s, _ = A.req('/api/caixa/staria/resultado', {'id': JOB, 'resultado': RES}); check(s == 409, 'entregar de novo um resultado já pronto é recusado')
s, _ = M.req('/api/caixa/staria/aplicar', {'id': JOB}); check(s == 403, 'caixista não aplica o resultado')
s, _ = A.req('/api/caixa/staria/aplicar', {'id': JOB}); check(s == 200, 'admin revisa e aplica ao caixa')
s, st = A.req('/api/caixa/state'); mv = next(m for m in st['mov'] if m['tipo'] == 'venda_staria')
check(mv['valor'] == 12500 and mv['periodoIni'] == '2026-10-01' and mv['periodoFim'] == '2026-10-07', 'lançamento de venda_staria criado só com as vendas (8.000+3.000+1.500 = 12.500), sem o crediário')
check(st['saldo'] == 14500 + 12500, 'saldo soma só as vendas por enquanto: 14.500 + 12.500 = 27.000')
s, _ = A.req('/api/caixa/staria/aplicar', {'id': JOB}); check(s == 409, 'aplicar de novo (já aplicado) é recusado')
s, _ = A.req('/api/caixa/mov/excluir', {'id': mv['id']}); check(s == 404, 'lançamento de venda_staria não pode ser apagado (fica sempre)')

print('== recebimento de crediário do StarIA: fica pendente até alguém aprovar (admin ou financeiro)')
CR = next(m for m in st['mov'] if m['tipo'] == 'crediario_staria')
check(CR['valor'] == 700 and CR['status'] == 'pendente' and CR['periodoIni'] == '2026-10-01' and CR['periodoFim'] == '2026-10-07', 'crediário de R$ 700 (500+0+200) fica pendente, com o período da consulta')
s, _ = A.req('/api/caixa/mov/excluir', {'id': CR['id']}); check(s == 404, 'crediário pendente também não pode ser apagado (só muda de status)')
s, _ = M.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'aprovar'}); check(s == 403, 'caixista não aprova crediário (só guarda e lança sangria)')

print('== acesso do financeiro: só aprova ou rejeita o crediário')
s, r = A.req('/api/caixa/pessoa', {'login': 'fi', 'nome': 'X', 'papel': 'financeiro'}); check(s == 400, 'usuário curto demais recusado')
s, r = A.req('/api/caixa/pessoa', {'login': 'financeiro1', 'nome': 'Fulano do financeiro', 'papel': 'financeiro'}); SENHAF0 = r.get('password')
check(s == 200 and SENHAF0 and r.get('papel') == 'financeiro', 'cria o acesso do financeiro')
s, st = A.req('/api/caixa/state'); pf = next(p for p in st['pessoas'] if p['login'] == 'financeiro1')
check(pf['papel'] == 'financeiro' and pf['ativo'] and pf['trocarSenha'], 'financeiro aparece na lista de acessos, com o papel certo')
s, _ = A.req('/api/caixa/pessoa', {'login': 'financeiro1', 'nome': 'Fulano do financeiro', 'papel': 'caixista'}); check(s == 200, 'o papel não muda depois de criado (continua financeiro mesmo pedindo caixista)')
s, st = A.req('/api/caixa/state'); check(next(p for p in st['pessoas'] if p['login'] == 'financeiro1')['papel'] == 'financeiro', 'papel confirmado: continua financeiro')

F = C(TID)
s, _ = F.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'aprovar'}); check(s == 401, 'sem login, financeiro não decide nada')
s, mef = F.req('/api/login', {'role': 'admin', 'login': 'financeiro1', 'password': SENHAF0}); check(s == 200 and mef.get('mustReset'), 'financeiro entra com a provisória e precisa trocar')
NPF = pw(); s, _ = F.req('/api/password', {'current': SENHAF0, 'next': NPF}); check(s == 200, 'financeiro cria a própria senha')
s, stf = F.req('/api/caixa/state'); check(s == 200 and stf['me']['role'] == 'financeiro' and stf['pessoas'] == [], 'financeiro vê o próprio estado, sem a lista de acessos (coisa do admin)')
s, _ = F.req('/api/caixa/sangria', {'valor': '10', 'data': '2026-10-08', 'motivo': 'x'}); check(s == 403, 'financeiro não lança sangria')
s, _ = F.req('/api/caixa/ajuste', {'valor': '-5', 'data': '2026-10-08', 'motivo': 'x'}); check(s == 403, 'financeiro não lança ajuste')
s, _ = F.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-08', 'periodoFim': '2026-10-08'}); check(s == 403, 'financeiro não pede consulta ao StarIA')
s, _ = F.req('/api/caixa/mov/excluir', {'id': CR['id']}); check(s == 403, 'financeiro não apaga nada')
s, _ = F.req('/api/caixa/pessoa', {'login': 'outro', 'nome': 'X', 'papel': 'caixista'}); check(s == 403, 'financeiro não cria outros acessos')
s, _ = F.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'invalida'}); check(s == 400, 'ação inválida recusada')
s, _ = F.req('/api/caixa/crediario/decidir', {'id': 'naoexiste', 'acao': 'aprovar'}); check(s == 404, 'aprovar lançamento inexistente recusado')
s, _ = F.req('/api/caixa/crediario/decidir', {'id': SG1, 'acao': 'aprovar'}); check(s == 404, 'só dá para decidir sobre um recebimento de crediário (não numa sangria)')
s, r = F.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'aprovar'}); check(s == 200 and r.get('status') == 'aprovado', 'financeiro aprova o crediário')
s, st = A.req('/api/caixa/state'); CR = next(m for m in st['mov'] if m['id'] == CR['id'])
check(CR['status'] == 'aprovado' and CR['decididoPor'] == 'Fulano do financeiro' and st['saldo'] == 27700, 'aprovado: agora entra no saldo (27.000 + 700 = 27.700)')
s, _ = F.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'rejeitar'}); check(s == 409, 'financeiro decide uma vez só: não muda a mesma pendência de novo')
s, r = A.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'rejeitar'}); check(s == 200, 'admin pode corrigir depois: rejeita o que já tinha sido aprovado')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == 27000, 'rejeitado: sai do saldo de novo (27.700 − 700 = 27.000)')
s, _ = A.req('/api/caixa/crediario/decidir', {'id': CR['id'], 'acao': 'aprovar'}); check(s == 200, 'admin aprova de novo')
s, st = A.req('/api/caixa/state'); check(st['saldo'] == 27700, 'de volta ao saldo com o crediário: 27.700')

print('== consulta com só crediário (vendas zeradas): cria só o lançamento de crediário')
s, r = A.req('/api/caixa/staria/pedir', {'periodoIni': '2026-10-08', 'periodoFim': '2026-10-08'}); JOB2 = r.get('id')
A.req('/api/caixa/staria/resultado', {'id': JOB2, 'resultado': {'porFilial': {'1': {'vendasDinheiro': 0, 'recebCrediarioDinheiro': 50}}}})
s, _ = A.req('/api/caixa/staria/aplicar', {'id': JOB2}); check(s == 200, 'aplica consulta só com crediário')
s, st = A.req('/api/caixa/state'); novos = [m for m in st['mov'] if m.get('periodoIni') == '2026-10-08']
check(len(novos) == 1 and novos[0]['tipo'] == 'crediario_staria' and novos[0]['valor'] == 50, 'sem venda em dinheiro no período: só o lançamento de crediário é criado (nenhum venda_staria de R$ 0)')
A.req('/api/caixa/crediario/decidir', {'id': novos[0]['id'], 'acao': 'rejeitar'})

print('== relatório por filial e consolidado')
s, st = A.req('/api/caixa/state'); pf = st['porFilial']
check(pf['1']['vendas'] == 8000 and pf['1']['crediario'] == 500, 'filial 1: vendas 8.000 + crediário aprovado 500 (o rejeitado de 50 não conta)')
check(pf['2']['vendas'] == 3000 and pf['2']['crediario'] == 0, 'filial 2: vendas 3.000, sem crediário')
check(pf['3']['vendas'] == 1500 and pf['3']['crediario'] == 200, 'filial 3: vendas 1.500 + crediário aprovado 200')
total_pf = sum(v['vendas'] + v['crediario'] for v in pf.values())
check(total_pf == 13200, 'soma das filiais (13.200 = 8.500+3.000+1.700) bate com o que entrou de StarIA')
check(st['saldo'] == 27700, 'saldo consolidado continua um só: 27.700 (relatório por filial não muda o caixa físico)')

print('== gaveta de impostos e financiamentos (só o admin)')
s, _ = M.req('/api/caixa/sangria', {'valor': '1000', 'data': '2026-10-09', 'motivo': 'Imposto', 'destino': 'impostos'}); check(s == 403, 'caixista não lança sangria para a gaveta de impostos')
s, r = A.req('/api/caixa/sangria', {'valor': '1000', 'data': '2026-10-09', 'motivo': 'Imposto 1', 'destino': 'impostos'}); SGI1 = r.get('id'); check(s == 200 and SGI1, 'admin lança sangria destino=impostos')
s, st = A.req('/api/caixa/state'); check(st['saldoImpostos'] == 1000, 'saldo da gaveta: R$ 1.000')
check(st['saldo'] == 26700, 'saldo principal cai do mesmo jeito: 27.700 − 1.000 = 26.700')
s, stm = M.req('/api/caixa/state'); check('saldoImpostos' not in stm and 'movImpostos' not in stm, 'caixista não vê a gaveta de impostos')
s, stf = F.req('/api/caixa/state'); check('saldoImpostos' not in stf and 'movImpostos' not in stf, 'financeiro não vê a gaveta de impostos')
sgi1_principal = next(m for m in st['mov'] if m['id'] == SGI1)
check(sgi1_principal['destino'] == 'impostos', 'a sangria aparece no extrato principal, marcada com o destino')
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

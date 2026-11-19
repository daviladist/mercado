"""Testes do Banco de dados de produtos (Tino, cadastro mestre) pela API, num banco de TESTE.
Uso: BASE=http://localhost:3077 CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/banco.py
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
class C:
    def __init__(self, tenant):
        self.t = tenant; self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None, raw=False, headers=None):
        h = {'X-App': '1'}
        if body is not None: h['Content-Type'] = 'application/json'
        if self.t is not None: h['X-Tenant'] = self.t
        if headers is not None: h = headers
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as resp:
                d = resp.read(); return (resp.status, d, dict(resp.headers)) if raw else (resp.status, json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); return (e.code, d, dict(e.headers)) if raw else (e.code, json.loads(d or b'{}') if d[:1] in (b'{', b'[') else {})
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
def png(): return 'data:image/png;base64,' + base64.b64encode(bytes.fromhex('89504e470d0a1a0a') + secrets.token_bytes(40)).decode()
def raw(d): return base64.b64decode(d.split(',')[1])
def ean13(base12):
    d = [int(c) for c in base12]; s = sum(x * (3 if i % 2 else 1) for i, x in enumerate(d)); return base12 + str((10 - s % 10) % 10)
E501, E700, E888 = ean13('789100010010'), ean13('789200020020'), ean13('789300030030')
BK = 'staria-davila'

print('== Central: o banco já nasce criado e só a Central mexe nele')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'super_admin entra')
s, st = cen.req('/api/central/state')
check(s == 200 and [b['id'] for b in st['bancos']] == [BK] and st['bancos'][0]['name'] == 'StarIA Dávila' and st['bancos'][0]['produtos'] == 0, 'o banco "StarIA Dávila" existe e começa vazio')
check(sorted(st['bancoRamos']) == ['atacado', 'encartes'], 'a Central sabe quais tipos de empresa usam banco')
s, _ = C(None).req('/api/central/banco/lista'); check(s == 401, 'sem entrar na Central, nada do banco')
s, r = cen.req('/api/central/banco/salvar', {'name': 'Mercado do Zé'}); check(s == 200 and r['id'] == 'mercado-do-ze' and len(r['bancos']) == 2, 'cria um segundo banco (outro cliente)'); BK2 = r['id']
s, r = cen.req('/api/central/banco/salvar', {'name': 'mercado do zé'}); check(s == 400, 'não cria banco com nome repetido')
s, r = cen.req('/api/central/banco/salvar', {'id': BK2, 'name': 'Mercado do Zé Ltda', 'filial': 3}); check(s == 200 and [b for b in r['bancos'] if b['id'] == BK2][0]['name'] == 'Mercado do Zé Ltda', 'renomeia o banco')
s, r = cen.req('/api/central/banco/produtos?b=nao-existe'); check(s == 404, 'banco inexistente: 404')

def entra(t, login, senha, role=None):
    c = C(t); b = {'login': login, 'password': senha}
    if role: b['role'] = role
    s, me = c.req('/api/login', b); assert s == 200, (s, me)
    if me.get('mustReset'): s, _ = c.req('/api/password', {'current': senha, 'next': pw()}); assert s == 200
    return c
def empresa(nome, ramo, login):
    s, r = cen.req('/api/central/tenant', {'name': nome, 'ramo': ramo, 'status': 'ativa'}); assert s == 200, r
    tid = r['tenant']['id']
    s, a = cen.req('/api/central/tenant-admin', {'id': tid, 'login': login, 'name': 'Dono'}); assert s == 200, a
    return tid, entra(tid, login, a['password'], 'admin' if ramo == 'atacado' else None)

print('== Distribuidora (app de pedidos): produtos, custos e fotos entram no banco ao ligar')
RED, red = empresa('Red Teste', 'atacado', 'dono')
F501 = png()
prods = [
    {'id': 'p1', 'name': 'Whey 900g', 'price': 150, 'cost': 70, 'code': '501', 'ean': E501, 'unit': 'UN', 'photo': F501},
    {'id': 'p2', 'name': 'Creatina 300g fardo', 'price': 240, 'cost': 120, 'code': '00502', 'ean': '', 'unit': 'Fardo c/ 12', 'perPack': 12},
    {'id': 'p3', 'name': 'Sem codigo', 'price': 10, 'cost': 5, 'code': '', 'ean': '', 'unit': 'UN'},
    {'id': 'p4', 'name': 'Whey 900g repetido', 'price': 150, 'code': '503', 'ean': E501, 'unit': 'UN'},
]
s, r = red.req('/api/sync', {'changes': [{'c': 'products', 'id': p['id'], 'op': 'put', 'doc': p} for p in prods]}); check(s == 200 and not r.get('rejected'), 'a distribuidora cadastra os produtos dela')
s, r = red.req('/api/banco/info'); check(s == 200 and r['banco'] is None, 'antes de ligar: a empresa não usa banco')
s, r = red.req('/api/banco/consulta', {'termos': ['501']}); check(s == 404, 'antes de ligar: não consulta banco nenhum')
s, st = red.req('/api/state'); check(st['T']['banco'] is False, 'o app sabe que a empresa não usa banco')
s, r = cen.req('/api/central/banco/usar', {'empresa': RED, 'banco': BK})
t = r.get('trouxe', {})
check(s == 200 and r['banco'] == BK and t.get('produtos') == 3 and t.get('fotos') == 1 and t.get('custos') == 2 and t.get('semCodigo') == 1, 'ligar a empresa traz 3 produtos, 1 foto e 2 custos; o sem código fica de fora e é contado')
s, st = cen.req('/api/central/state'); b0 = [b for b in st['bancos'] if b['id'] == BK][0]
check([x['banco'] for x in st['tenants'] if x['id'] == RED] == [BK] and b0['produtos'] == 3 and b0['comFoto'] == 1 and b0['comCusto'] == 2, 'a Central mostra a empresa ligada e os números do banco')
s, L = cen.req('/api/central/banco/produtos?b=' + BK); P = {x['codigo']: x for x in L['itens']}
check(s == 200 and sorted(P) == ['501', '502', '503'] and L['totais'] == {'todos': 3, 'semfoto': 2, 'semcusto': 1, 'erros': 3}, 'lista do banco com os totais de cada filtro')
check(P['502']['custo'] == 10 and '÷ 12' in P['502']['custoFonte'] and P['501']['custo'] == 70 and P['501']['custoFonte'] == 'Red Teste', 'custo do fardo entra dividido pela embalagem; o custo diz de onde veio')
check('código de barras repetido em outro produto' in P['501']['erros'] and 'código de barras repetido em outro produto' in P['503']['erros'] and P['502']['erros'] == ['sem código de barras'], 'possivelmente errados: código de barras repetido e produto sem código de barras')
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&f=semfoto'); check([x['codigo'] for x in L['itens']] == ['502', '503'], 'filtro: sem foto')
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&q=creatina%20fardo'); check([x['codigo'] for x in L['itens']] == ['502'], 'busca por pedaços do nome')
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&q=' + E501); check(sorted(x['codigo'] for x in L['itens']) == ['501', '503'], 'busca pelo código de barras')
s, img, hh = cen.req('/api/central/banco/foto?b=' + BK + '&id=' + P['501']['foto'], raw=True, headers={}); check(s == 200 and img == raw(F501) and hh.get('Content-Type') == 'image/png', 'a foto do produto veio inteira para o banco')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '501', 'nome': 'WHEY PROTEIN 900G'}); check(s == 200 and r['produto']['nome'] == 'WHEY PROTEIN 900G', 'a Central corrige o nome de um produto')
s, r = cen.req('/api/central/banco/importar', {'banco': BK, 'empresas': [RED]}); e = r['empresas'][0]
check(s == 200 and e['produtos'] == 0 and e['fotos'] == 0 and e['custos'] == 0, 'trazer de novo não duplica nada')
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&q=501'); check(L['itens'][0]['nome'] == 'WHEY PROTEIN 900G' and L['itens'][0]['custo'] == 70, 'trazer de novo só preenche o que está vazio: o que já foi corrigido no banco fica')
s, r = cen.req('/api/central/banco/importar', {'banco': BK, 'empresas': []}); check(s == 400, 'trazer sem marcar empresa é recusado')

print('== Distribuidora: busca no banco pelo cadastro de produto')
s, r = red.req('/api/banco/info'); check(s == 200 and r['banco'] == {'id': BK, 'name': 'StarIA Dávila'}, 'depois de ligar: a empresa vê qual banco usa')
s, st = red.req('/api/state'); check(st['T']['banco'] is True, 'o app sabe que a empresa usa banco')
s, r = red.req('/api/banco/consulta', {'termos': ['502', E501, '999', '00501']}); R = r.get('resultados', {})
check(s == 200 and R['502']['nome'] == 'Creatina 300g fardo' and R['502']['custo'] == 10 and R['999'] is None and R['00501']['codigo'] == '501', 'consulta por código (com ou sem zeros na frente); o que não existe volta vazio')
check(R[E501]['codigo'] == '501' and R[E501]['varios'] is True and R[E501]['foto'].startswith('/api/banco/foto/'), 'consulta por código de barras avisa quando há mais de um cadastro')
s, img, hh = red.req(R[E501]['foto'], raw=True, headers={}); check(s == 200 and img == raw(F501), 'a foto do banco chega para a empresa ligada')
GP, VP = pw(), pw()
ger = {'id': 'adm_ger', 'name': 'Gerente', 'login': 'gerente', 'pass': GP, 'perms': {'editar': True, 'pedidos': True, 'produtos': True, 'custos': False}}
sem = {'id': 'adm_fin', 'name': 'Financeiro', 'login': 'financeiro', 'pass': GP, 'perms': {'editar': True, 'financeiro': True, 'produtos': False}}
s, r = red.req('/api/sync', {'changes': [{'c': 'admins', 'id': a['id'], 'op': 'put', 'doc': a} for a in (ger, sem)] + [{'c': 'sellers', 'id': 's1', 'op': 'put', 'doc': {'id': 's1', 'name': 'Vend', 'login': 'vend', 'pass': VP, 'commission': 5, 'active': True}}]})
assert s == 200 and not r.get('rejected'), r
g = entra(RED, 'gerente', GP, 'admin'); s, r = g.req('/api/banco/consulta', {'termos': ['502']})
check(s == 200 and r['resultados']['502']['nome'] and 'custo' not in r['resultados']['502'], 'administrador sem "ver custo" consulta o banco e NÃO recebe o custo')
f = entra(RED, 'financeiro', GP, 'admin'); s, r = f.req('/api/banco/consulta', {'termos': ['502']}); check(s == 403, 'administrador sem acesso a produtos não consulta o banco')
v = entra(RED, 'vend', VP, 'vendedor'); s, r = v.req('/api/banco/consulta', {'termos': ['502']}); check(s == 403, 'vendedor não consulta o banco')
s, _, _ = v.req(R[E501]['foto'], raw=True, headers={}); check(s == 403, 'vendedor não abre foto do banco')
OUT, out = empresa('Outra Loja', 'atacado', 'dono')
s, r = out.req('/api/banco/consulta', {'termos': ['502']}); check(s == 404, 'empresa que NÃO foi ligada não consulta o banco')
s, _, _ = out.req(R[E501]['foto'], raw=True, headers={}); check(s == 404, 'empresa que NÃO foi ligada não abre foto do banco')
s, r = red.req('/api/central/banco/produtos?b=' + BK); check(s == 401, 'administrador de empresa não entra nas rotas do banco da Central')

print('== Central: criar, corrigir, foto e apagar produto')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'novo': True, 'codigo': '0900', 'nome': '  <b>Arroz</b> 5kg ', 'ean': E888, 'custo': '21,50'})
check(s == 200 and r['novo'] and r['produto'] == dict(r['produto'], codigo='900', nome='Arroz 5kg', ean=E888, custo=21.5, erros=[]), 'cria produto na Central (código sem zeros na frente, nome limpo, custo com vírgula)')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'novo': True, 'codigo': '900', 'nome': 'x'}); check(s == 400, 'não cria código repetido')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '901', 'nome': 'x'}); check(s == 404, 'corrigir produto que não existe: 404')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'ean': '123'}); check(s == 400, 'código de barras curto é recusado')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'ean': E888[:-1] + str((int(E888[-1]) + 1) % 10)}); check(s == 200 and r['produto']['erros'] == ['código de barras inválido'], 'código de barras com dígito errado entra, mas aparece em possivelmente errados')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'ean': E888, 'custo': 0}); check(s == 200 and r['produto']['erros'] == ['custo zerado'], 'custo zerado aparece em possivelmente errados')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'custo': None}); check(s == 200 and r['produto']['custo'] is None and r['produto']['ean'] == E888, 'tirar o custo não mexe no resto')
F900 = png(); s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'foto': F900}); fid = r['produto']['foto']; check(s == 200 and len(fid) == 32, 'envia a foto de um produto')
s, img, _ = cen.req('/api/central/banco/foto?b=' + BK + '&id=' + fid, raw=True, headers={}); check(s == 200 and img == raw(F900), 'a foto volta igual')
s, _, _ = cen.req('/api/central/banco/foto?b=' + BK2 + '&id=' + fid, raw=True, headers={}); check(s == 404, 'foto de um banco não aparece em outro banco')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'foto': 'data:text/html;base64,PHNjcmlwdD4='}); check(s == 400, 'só aceita imagem')
s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '900', 'foto': None}); check(s == 200 and r['produto']['foto'] is None, 'tira a foto')
FN = png(); s, r = cen.req('/api/central/banco/foto-nome', {'banco': BK, 'termo': E888, 'foto': FN}); check(s == 200 and r['ok'] and r['codigos'] == ['900'], 'foto pelo nome do arquivo = código de barras')
s, r = cen.req('/api/central/banco/foto-nome', {'banco': BK, 'termo': '502', 'foto': FN}); check(s == 200 and r['ok'] and r['codigos'] == ['502'], 'foto pelo nome do arquivo = código interno')
s, r = cen.req('/api/central/banco/foto-nome', {'banco': BK, 'termo': '77777', 'foto': FN}); check(s == 200 and r['ok'] is False, 'arquivo com código que não existe é avisado, sem criar produto')
s, r = cen.req('/api/central/banco/produto-del', {'banco': BK, 'codigo': '900'}); check(s == 200, 'apaga um produto do banco')
s, r = cen.req('/api/central/banco/produto-del', {'banco': BK, 'codigo': '900'}); check(s == 404, 'apagar de novo: 404')
s, L = cen.req('/api/central/banco/produtos?b=' + BK2); check(L['totais']['todos'] == 0, 'o outro banco continua vazio (um não enxerga o outro)')

print('== Gerador de Encartes: o que ele já tem entra no banco ao ligar')
ENC, enc = empresa('Encartes Teste', 'encartes', 'dono')
ENC2, enc2 = empresa('Encartes Sem Banco', 'encartes', 'dono2')
def blob(c, d=None): d = d or png(); s, b = c.req('/api/encartes/blob', {'data': d}); assert s == 200, b; return b['id'], d
X700, D700 = blob(enc); YE, DE = blob(enc); ZN, _ = blob(enc); W1, _ = blob(enc)
cat = {'at': 5, 'filial': 1, 'itens': [{'c': '700', 'e': E700, 'd': 'ARROZ TIPO 1 5KG', 'pv': 25.9, 'vv': None, 'pm': None, 'at': 5, 'src': 'estoque'}]}
enc.req('/api/encartes/doc', {'p': 'app/catalogo', 'data': {'at': 5, 'data': json.dumps(cat)}})
enc.req('/api/encartes/doc', {'p': 'app/custos', 'data': {'at': 5, 'data': json.dumps({'at': 5, 'm': {'700': {'cu': 20.1, 'tx': 0, 'cm': None, 'at': 5, 'src': 'estoque'}}})}})
enc.req('/api/encartes/doc', {'p': 'comum/imagens', 'data': {'map': {'c:700': X700, 'e:' + E501: YE, 'n:arroz tipo': ZN, 'id:abc123': W1, 'c:0000': W1}}})
enc.req('/api/encartes/doc', {'p': 'salvos/s1', 'data': {'at': 1, 'data': json.dumps({'id': 's1', 'at': 1, 'products': [{'id': 'a', 'code': '701', 'desc': 'Feijão Carioca 1kg', 'ean': ''}]})}})
s, d = enc.req('/api/encartes/doc?p=comum/imagens'); check('c:501' not in d['data']['map'], 'antes de ligar: o mapa de fotos do encarte não tem nada do banco')
s, r = cen.req('/api/central/banco/usar', {'empresa': ENC, 'banco': BK}); t = r.get('trouxe', {})
check(s == 200 and t.get('produtos') == 2 and t.get('custos') == 1 and t.get('fotos') == 2 and t.get('semCodigo') == 2, 'ligar o encarte traz o catálogo, o custo, o produto do encarte salvo e as fotos com código; fotos só com nome ficam de fora')
s, L = cen.req('/api/central/banco/produtos?b=' + BK); P = {x['codigo']: x for x in L['itens']}
check(P['700']['nome'] == 'ARROZ TIPO 1 5KG' and P['700']['ean'] == E700 and P['700']['custo'] == 20.1 and P['700']['preco'] == 25.9 and P['700']['foto'] == X700, 'produto do encarte: nome, código de barras, custo, preço e foto')
check(P['701']['nome'] == 'Feijão Carioca 1kg' and P['503']['foto'] == YE and P['501']['foto'] != YE, 'foto ligada pelo código de barras entra só no produto que estava sem foto')

print('== Gerador de Encartes ligado: recebe foto e nome do banco')
s, d = enc.req('/api/encartes/doc?p=comum/imagens'); M = d['data']['map']
check(M.get('c:501') == P['501']['foto'] and M.get('c:700') == X700 and M.get('c:503') == YE and M.get('n:arroz tipo') == ZN, 'o mapa de fotos do encarte ganha as fotos do banco pela chave do código, sem perder as dele')
s, img, hh = enc.req('/api/encartes/blob?id=' + P['501']['foto'], raw=True, headers={}); check(s == 200 and img == raw(F501), 'a foto que veio da distribuidora abre dentro do encarte')
s, CATD = enc.req('/api/encartes/doc?p=app/catalogo'); its = {x['c']: x for x in json.loads(CATD['data']['data'])['itens']}
check(its['700']['pv'] == 25.9 and its['700']['src'] == 'estoque' and its['501']['d'] == 'WHEY PROTEIN 900G' and its['501']['src'] == 'banco' and its['501']['e'] == E501, 'o catálogo do encarte ganha os produtos do banco, sem mexer nos dele')
s, d = enc.req('/api/encartes/doc?p=app/custos'); check(list(json.loads(d['data']['data'])['m']) == ['700'], 'o custo do banco não é empurrado para dentro do encarte')
s, f = enc.req('/api/encartes/pessoa', {'criar': True, 'nome': 'Maria', 'login': 'maria'}); maria = entra(ENC, 'maria', f['password'])
s, d = maria.req('/api/encartes/doc?p=app/catalogo'); check(s == 200 and '"501"' in d['data']['data'], 'funcionária também recebe os produtos do banco')
s, d = enc2.req('/api/encartes/doc?p=comum/imagens'); check(s == 200 and d.get('exists') is False, 'encarte que NÃO foi ligado não recebe nada do banco')
s, _, _ = enc2.req('/api/encartes/blob?id=' + P['501']['foto'], raw=True, headers={}); check(s == 404, 'encarte que NÃO foi ligado não abre foto do banco')

print('== Gerador de Encartes ligado: foto nova sobe para o banco')
N502, D502 = blob(maria); N889, _ = blob(enc); N700, D700b = blob(enc); NE, DEb = blob(enc)
novo = dict(M); novo.update({'c:502': N502, 'c:889': N889, 'c:700': N700, 'e:' + E700: NE, 'id:zzz': W1})
s, _ = maria.req('/api/encartes/doc', {'p': 'comum/imagens', 'data': {'map': novo}}); check(s == 200, 'o encarte grava o mapa de fotos')
s, L = cen.req('/api/central/banco/produtos?b=' + BK); P = {x['codigo']: x for x in L['itens']}
check(P['502']['foto'] == N502 and P['502']['fotoFonte'] == 'Encartes Teste', 'foto nova de um produto com código sobe para o banco (troca a que estava)')
check('889' in P and P['889']['foto'] == N889 and P['889']['nome'] == '', 'código que o banco não conhecia entra com a foto (e sem nome, para conferir)')
check(P['700']['foto'] == N700, 'trocar a foto no encarte troca no banco')
check(P['501']['foto'] != N502 and P['503']['foto'] == YE, 'os outros produtos ficam como estavam')
s, img, _ = cen.req('/api/central/banco/foto?b=' + BK + '&id=' + N502, raw=True, headers={}); check(s == 200 and img == raw(D502), 'a foto enviada pela funcionária está no banco')
s, r = red.req('/api/banco/consulta', {'termos': ['502']}); s, img, _ = red.req(r['resultados']['502']['foto'], raw=True, headers={}); check(img == raw(D502), 'a distribuidora já enxerga a foto que foi colocada no encarte')
FC = png(); s, r = cen.req('/api/central/banco/produto', {'banco': BK, 'codigo': '700', 'foto': FC}); FCID = r['produto']['foto']
s, d = enc.req('/api/encartes/doc?p=comum/imagens'); M3 = d['data']['map']; check(M3.get('c:700') == FCID, 'foto trocada na Central aparece no encarte (o banco manda)')
s, _ = enc.req('/api/encartes/doc', {'p': 'comum/imagens', 'data': {'map': M3}})            # aparelho atualizado regrava o que recebeu
s, _ = enc.req('/api/encartes/doc', {'p': 'comum/imagens', 'data': {'map': dict(M3, **{'c:700': N700})}})   # aparelho aberto há dias reenvia a foto antiga
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&q=700'); check(L['itens'][0]['foto'] == FCID, 'aparelho antigo reenviando a foto velha não desfaz a troca feita no banco')
s, _ = enc.req('/api/encartes/doc', {'p': 'app/catalogo', 'data': CATD['data']})   # o app regrava o catálogo que recebeu (com os itens do banco)
s, r = cen.req('/api/central/banco/usar', {'empresa': ENC, 'banco': None}); check(s == 200 and r['banco'] is None, 'a Central desliga a empresa do banco')
s, d = enc.req('/api/encartes/doc?p=comum/imagens'); M2 = d['data']['map']
check('c:501' not in M2 and M2.get('c:503') == YE and M2.get('c:502') == N502 and M2.get('c:700') == N700 and M2.get('id:zzz') == W1 and M2.get('n:arroz tipo') == ZN, 'desligada, a empresa fica só com as fotos dela (o que veio do banco não foi gravado nela)')
s, d = enc.req('/api/encartes/doc?p=app/catalogo'); check([x['c'] for x in json.loads(d['data']['data'])['itens']] == ['700'], 'desligada, o catálogo dela volta a ter só os produtos dela')
s, _, _ = enc.req('/api/encartes/blob?id=' + P['501']['foto'], raw=True, headers={}); check(s == 404, 'desligada, não abre mais foto do banco')
s, r = cen.req('/api/central/banco/usar', {'empresa': ENC, 'banco': BK}); check(s == 200 and r['trouxe']['produtos'] == 0, 'ligar de novo não duplica produto')
RUR = cen.req('/api/central/tenant', {'name': 'Sitio Teste', 'ramo': 'rural', 'status': 'ativa'})[1]['tenant']['id']
s, r = cen.req('/api/central/banco/usar', {'empresa': RUR, 'banco': BK}); check(s == 400, 'tipo de empresa que não usa banco é recusado')
s, r = cen.req('/api/central/banco/usar', {'empresa': 'nao-existe', 'banco': BK}); check(s == 404, 'empresa inexistente: 404')
s, r = cen.req('/api/central/banco/usar', {'empresa': RED, 'banco': 'nao-existe'}); check(s == 404, 'ligar a um banco inexistente: 404')

print('== Atualizar pelo StarIA: a Central deixa o pedido, o Claude devolve')
s, r = cen.req('/api/central/banco/pedir', {'banco': BK}); J1 = r.get('pedido', {})
check(s == 200 and J1.get('status') == 'pendente' and J1['termos'][0] == '889' and sorted(J1['termos']) == ['501', '502', '503', '700', '701', '889'], 'pedido sem lista pega os produtos nunca conferidos (os sem nome primeiro)')
s, r = cen.req('/api/central/banco/pedir', {'banco': BK, 'codigos': '1 2'}); check(s == 200 and r.get('jaPedido') and r['pedido']['id'] == J1['id'], 'com um pedido esperando, não abre outro')
s, r = cen.req('/api/central/banco/jobs?b=' + BK); check(s == 200 and r['filial'] == 1 and r['pedidos'][0]['id'] == J1['id'], 'o Claude lê o pedido pendente e a filial')
res = {'501': {'codigo': '501', 'ean': E501, 'nome': 'WHEY PROTEIN CONC 900G', 'preco': 159.9}, '502': {'codigo': 502, 'ean': '', 'nome': 'CREATINA 300G', 'preco': 5, 'custo': 10},
       '503': None, '700': {'codigo': '700', 'ean': E700, 'nome': 'ARROZ T1 5KG', 'preco': 0}, '701': {'codigo': '701', 'nome': 'FEIJAO CARIOCA 1KG', 'ean': E888}}
s, r = cen.req('/api/central/banco/resultado', {'id': J1['id'], 'resultados': res}); check(s == 400 and '889' in r.get('error', ''), 'resultado faltando um código é recusado (e nada é gravado)')
res['889'] = None
s, r = red.req('/api/central/banco/resultado', {'id': J1['id'], 'resultados': res}); check(s == 401, 'só a Central devolve resultado')
s, r = cen.req('/api/central/banco/resultado', {'id': J1['id'], 'resultados': res}); check(s == 200 and r['atualizados'] == 4 and sorted(r['naoAchou']) == ['503', '889'], 'resultado completo é aceito')
s, r = cen.req('/api/central/banco/resultado', {'id': J1['id'], 'resultados': res}); check(s == 409, 'o mesmo resultado não entra duas vezes')
s, L = cen.req('/api/central/banco/produtos?b=' + BK); P = {x['codigo']: x for x in L['itens']}
check(P['501']['nome'] == 'WHEY PROTEIN CONC 900G' and P['501']['preco'] == 159.9 and P['501']['custo'] == 70 and P['501']['conferidoEm'], 'o sistema de origem manda no nome e no preço; o custo que já estava fica')
check(P['701']['ean'] == E888 and P['700']['preco'] == 25.9 and P['700']['nome'] == 'ARROZ T1 5KG', 'código de barras que faltava é preenchido; preço zerado não apaga o que estava')
check('custo maior que o preço de venda' in P['502']['erros'] and 'não encontrado no sistema' in P['503']['erros'] and 'não encontrado no sistema' in P['889']['erros'], 'possivelmente errados: custo maior que o preço e produto que o sistema não achou')
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&f=erros'); check(sorted(x['codigo'] for x in L['itens']) == ['501', '502', '503', '889'] and L['totais']['erros'] == 4, 'filtro: possivelmente errados')
s, r = cen.req('/api/central/banco/pedir', {'banco': BK, 'codigos': ['00950', E888, '950']}); J2 = r.get('pedido', {}); check(s == 200 and J2['termos'] == ['950', E888], 'pedido com códigos digitados (interno ou de barras), sem repetir')
s, r = cen.req('/api/central/banco/pedir', {'banco': BK2, 'codigos': 'abc def!'}); check(s == 400, 'código estranho é recusado')
s, r = cen.req('/api/central/banco/resultado', {'id': J2['id'], 'resultados': {'950': {'codigo': '950', 'ean': '', 'nome': 'PRODUTO NOVO 1UN', 'preco': 9.99}, E888: {'codigo': '701', 'ean': E888, 'nome': 'FEIJAO CARIOCA TIPO 1 1KG'}}})
check(s == 200 and r['atualizados'] == 2, 'resultado de códigos digitados')
s, L = cen.req('/api/central/banco/produtos?b=' + BK + '&q=950'); check(L['itens'][0]['nome'] == 'PRODUTO NOVO 1UN' and L['itens'][0]['fonte'] == 'sistema de origem', 'código novo vindo do sistema de origem entra no banco')
s, r = cen.req('/api/central/banco/pedir', {'banco': BK}); J3 = r['pedido']; check(J3['termos'][0] not in ('501', '950'), 'o próximo pedido começa pelos conferidos há mais tempo')
s, r = cen.req('/api/central/banco/pedido-cancelar', {'id': J3['id']}); check(s == 200, 'cancela um pedido que está esperando')
s, r = cen.req('/api/central/banco/pedido-cancelar', {'id': J3['id']}); check(s == 409, 'cancelar de novo: 409')
s, r = cen.req('/api/central/banco/pedir', {'banco': BK2}); check(s == 400, 'banco vazio: não há o que conferir')

print('== o que já existia continua igual')
s, st = red.req('/api/state'); pr = {p['id']: p for p in st['S']['products']}
check(pr['p1']['name'] == 'Whey 900g' and pr['p1']['photo'].startswith('/api/photo/') and pr['p2']['cost'] == 120, 'o cadastro da distribuidora não foi mexido pelo banco')
A = C('@'); s, me = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); s, r = A.req('/api/banco/info'); check(s == 200 and r['banco'] is None, 'a empresa principal segue sem banco até a Central ligar')
s, a = cen.req('/api/central/banco/usar', {'empresa': 'davila', 'banco': BK}); check(s == 200 and a['banco'] == BK, 'a empresa principal também pode ser ligada')

print('== App de pedidos ligado: o produto salvo sobe sozinho para o banco')
def banco_de(cod): return [x for x in cen.req('/api/central/banco/produtos?b=' + BK + '&q=' + cod)[1]['itens'] if x['codigo'] == cod]
def ver(c, pid): return c.req('/api/state')[1]['V']['products'][pid]
F504 = png()
s, r = red.req('/api/sync', {'changes': [{'c': 'products', 'id': 'p5', 'op': 'put', 'doc': {'id': 'p5', 'name': 'Pasta de Amendoim 1kg', 'price': 40, 'cost': 24, 'code': '504', 'ean': '', 'unit': 'Caixa c/ 6', 'perPack': 6, 'photo': F504}}]})
x = banco_de('504')
check(s == 200 and not r.get('rejected') and len(x) == 1 and x[0]['nome'] == 'Pasta de Amendoim 1kg' and x[0]['custo'] == 4 and x[0]['foto'] and x[0]['fotoFonte'] == 'Red Teste', 'produto novo salvo na distribuidora entra no banco na hora, com custo de uma unidade e foto')
s, img, _ = cen.req('/api/central/banco/foto?b=' + BK + '&id=' + x[0]['foto'], raw=True, headers={}); check(img == raw(F504), 'a foto do produto novo está no banco')
antes = banco_de('501')[0]
st = red.req('/api/state')[1]; p1 = [p for p in st['S']['products'] if p['id'] == 'p1'][0]
s, r = red.req('/api/sync', {'changes': [{'c': 'products', 'id': 'p1', 'op': 'put', 'ver': st['V']['products']['p1'], 'doc': dict(p1, price=155, cost=99, name='Whey mudou de nome')}]})
d = banco_de('501')[0]
check(s == 200 and not r.get('rejected') and d['foto'] == antes['foto'] and d['custo'] == 70 and d['nome'] == antes['nome'], 'mudar preço, custo ou nome na distribuidora não mexe no que o banco já tem (nem na foto)')
st = red.req('/api/state')[1]; p1 = [p for p in st['S']['products'] if p['id'] == 'p1'][0]; FN1 = png()
s, r = red.req('/api/sync', {'changes': [{'c': 'products', 'id': 'p1', 'op': 'put', 'ver': st['V']['products']['p1'], 'doc': dict(p1, photo=FN1)}]})
d = banco_de('501')[0]; s2, img, _ = cen.req('/api/central/banco/foto?b=' + BK + '&id=' + d['foto'], raw=True, headers={})
check(s == 200 and not r.get('rejected') and d['foto'] != antes['foto'] and img == raw(FN1) and d['fotoFonte'] == 'Red Teste', 'trocar a foto na distribuidora troca a foto no banco')
s, r = red.req('/api/sync', {'changes': [{'c': 'products', 'id': 'p6', 'op': 'put', 'doc': {'id': 'p6', 'name': 'Sem codigo 2', 'price': 10, 'cost': 5, 'code': '', 'unit': 'UN', 'photo': png()}}]})
check(s == 200 and not r.get('rejected') and cen.req('/api/central/banco/produtos?b=' + BK + '&q=sem%20codigo')[1]['totais']['todos'] == 0, 'produto sem código salva normal na distribuidora e não entra no banco')
n0 = cen.req('/api/central/banco/produtos?b=' + BK)[1]['totais']['todos']
s, r = out.req('/api/sync', {'changes': [{'c': 'products', 'id': 'z1', 'op': 'put', 'doc': {'id': 'z1', 'name': 'De outra loja', 'price': 10, 'cost': 5, 'code': '777', 'unit': 'UN'}}]})
check(s == 200 and cen.req('/api/central/banco/produtos?b=' + BK)[1]['totais']['todos'] == n0, 'empresa que NÃO foi ligada salva produto sem tocar no banco')

print(f'\n{ok} verificações certas, {len(fails)} falhas')
if fails:
    for f in fails: print('  -', f)
    sys.exit(1)

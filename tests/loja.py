"""Testes da Loja online (Tino, segmento 'loja') pela API, num banco de TESTE.
Uso: BASE=http://localhost:3077 CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/loja.py
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

print('== Central: três segmentos fixos')
cen = C(None); s, _ = cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW}); check(s == 200, 'super_admin entra')
s, st = cen.req('/api/central/state')
check([r['id'] for r in st['ramos']] == ['atacado', 'rural', 'loja'] and [r['name'] for r in st['ramos']] == ['Atacado e varejo', 'Rural', 'Loja online'], 'segmentos: Atacado e varejo, Rural e Loja online')
check(len(st.get('lojaModules', [])) >= 5, 'Central conhece as funções da Loja online')
s, r = cen.req('/api/central/tenant', {'name': 'Ateliê Maria', 'ramo': 'loja', 'modules': {'pagar': True}}); check(s == 400, 'módulo do atacado é recusado na loja online')
s, r = cen.req('/api/central/tenant', {'name': 'Ateliê Maria', 'ramo': 'loja', 'color': '#B4410F'}); T = r.get('tenant', {}); TID = T.get('id')
STARIA_MODS = ('l_staria_imp', 'l_staria_preco')
check(s == 200 and T.get('ramo') == 'loja' and T['status'] == 'em_preparo' and all(v for k, v in T['modules'].items() if k not in STARIA_MODS), 'cria a loja online "Ateliê Maria", em preparo, com todas as funções')
check(all(T['modules'].get(k) is False for k in STARIA_MODS), 'opções do StarIA (importação e atualização de preço) começam desmarcadas')
s, r = cen.req('/api/central/tenant', {'name': 'Mercado do Zé', 'ramo': 'loja'}); TX = r['tenant']['id']
s, r = cen.req('/api/central/tenant', {'id': TID, 'ramo': 'rural'}); check(r['tenant']['ramo'] == 'loja', 'o segmento não muda depois de criado')
s, r = cen.req('/api/central/tenant-admin', {'id': TID, 'login': 'maria'}); P0 = r.get('password'); check(s == 200 and P0, 'acesso da dona da loja criado')
s, r = cen.req('/api/central/tenant-admin', {'id': TX, 'login': 'zemercado'}); X0 = r.get('password')

print('== páginas')
s, html, h = C(None).req('/t/' + TID + '/', raw=True); check(s == 200 and b'lojaadm.js' in html and b'/app.js' not in html, 'endereço da empresa abre o painel da loja')
s, html, h = C(None).req('/t/' + TID + '/loja', raw=True); check(s == 200 and b'/loja.js' in html and b'<title>Ateli' in html, '/loja abre a vitrine do cliente, com o nome da loja')
s, html, h = C(None).req('/t/' + TID + '/cliente', raw=True); check(s == 302 and h.get('Location') == '/t/' + TID + '/loja', '/cliente leva para a vitrine')
s, mf = C(None).req('/api/manifest?t=' + TID + '&k=cliente'); check(mf.get('start_url') == '/t/' + TID + '/loja', 'vitrine instalada no celular abre a loja')
s, _ = C(TID).req('/api/loja/vitrine'); check(s == 403, 'loja em preparo: vitrine ainda não abre')
s, r = cen.req('/api/central/tenant', {'name': 'Sítio Teste', 'ramo': 'rural'}); TR = r['tenant']['id']
s, html, h = C(None).req('/t/' + TR + '/loja', raw=True); check(s == 302 and h.get('Location') == '/t/' + TR + '/', '/loja de empresa rural volta para o app dela')
s, html, h = C(None).req('/t/davila/loja', raw=True); check(s == 302, '/loja da empresa principal (atacado) não abre vitrine')

print('== painel da loja')
A = C(TID)
s, _ = A.req('/api/loja/admin/state'); check(s == 401, 'painel sem login não abre')
s, me = A.req('/api/login', {'role': 'admin', 'login': 'maria', 'password': P0}); check(s == 200 and me.get('mustReset'), 'dona entra com a provisória e troca a senha')
NP = pw(); A.req('/api/password', {'current': P0, 'next': NP})
s, st = A.req('/api/loja/admin/state'); check(s == 200 and st['empresa']['nome'] == 'Ateliê Maria' and st['config']['aberta'], 'painel carrega')
s, _ = A.req('/api/state'); check(s == 404, 'rotas do atacado não existem para a loja online')
s, _ = A.req('/api/rural/state'); check(s == 404, 'rotas do produtor rural não existem para a loja online')
s, _ = A.req('/api/loja/admin/foto', {'data': 'data:image/svg+xml;base64,PHN2Zz4='}); check(s == 400, 'foto SVG é recusada')
s, _ = A.req('/api/loja/admin/foto', {'data': 'data:image/png;base64,' + 'A' * 800000}); check(s in (400, 413), 'foto grande demais é recusada')
s, f1 = A.req('/api/loja/admin/foto', {'data': PNG}); F1 = f1.get('id'); check(s == 200 and F1, 'envia foto')
s, img, h = C(None).req('/api/loja/foto/' + F1 + '?t=' + TID, raw=True, headers={}); check(s == 200 and h.get('Content-Type') == 'image/png', 'foto sai pelo endereço da loja')
s, img, h = C(None).req('/api/loja/foto/' + F1 + '?t=' + TX, raw=True, headers={}); check(s == 404, 'foto de uma loja não sai pelo endereço de outra')
s, _ = A.req('/api/loja/admin/config', {'whatsapp': '27 99999-0000', 'endereco': 'Rua das Flores, 10', 'pagamentos': ['pix', 'dinheiro'], 'pixChave': 'maria@pix', 'retirada': True, 'entrega': True, 'taxaEntrega': '8,00', 'pedidoMinimo': 0}); check(s == 200, 'configura WhatsApp, PIX, retirada e entrega com taxa')
s, _ = A.req('/api/loja/admin/config', {'pagamentos': ['bitcoin']}); check(s == 400, 'forma de pagamento desconhecida recusada')

VES, VP, VM, VG = xid(), vid(), vid(), vid()
s, _ = A.req('/api/loja/admin/produto', {'id': VES, 'nome': 'Vestido floral', 'preco': '129,90', 'faixas': [{'min': 3, 'preco': 140}]}); check(s == 400, 'faixa com preço maior que o normal é recusada')
s, _ = A.req('/api/loja/admin/produto', {'id': VES, 'nome': 'Vestido floral', 'preco': 129.9, 'faixas': [{'min': 3, 'preco': 110}, {'min': 6, 'preco': 115}]}); check(s == 400, 'faixa maior com preço maior que a anterior é recusada')
s, _ = A.req('/api/loja/admin/produto', {'id': VES, 'nome': 'Vestido floral', 'preco': 129.9, 'precoDe': 100}); check(s == 400, 'preço "de" menor que o preço é recusado')
s, _ = A.req('/api/loja/admin/produto', {'id': VES, 'nome': 'Vestido floral', 'preco': 129.9, 'fotos': ['f' + hx(8)]}); check(s == 400, 'foto que não existe é recusada')
s, r = A.req('/api/loja/admin/produto', {'id': VES, 'nome': 'Vestido <b>floral</b>', 'preco': '129,90', 'precoDe': '159,90', 'categoria': 'Vestidos', 'fotos': [F1], 'grupoVar': 'Tamanho',
    'variacoes': [{'id': VP, 'nome': 'P', 'estoque': 2}, {'id': VM, 'nome': 'M', 'estoque': 5}, {'id': VG, 'nome': 'G', 'estoque': 0}], 'faixas': [{'min': 3, 'preco': '109,90'}]})
check(s == 200, 'cadastra vestido com tamanhos P/M/G, estoque e "a partir de 3: R$ 109,90"')
BLU = xid(); A.req('/api/loja/admin/produto', {'id': BLU, 'nome': 'Blusa básica', 'preco': 49.9, 'estoque': 10, 'categoria': 'Blusas'})
OCU = xid(); A.req('/api/loja/admin/produto', {'id': OCU, 'nome': 'Peça escondida', 'preco': 10, 'ativo': False})
s, st = A.req('/api/loja/admin/state'); ves = next(p for p in st['produtos'] if p['id'] == VES)
check('<' not in ves['nome'] and ves['variacoes'][0]['estoque'] == 2, 'painel vê o estoque; nome sem marcação HTML')

print('== vitrine e pedido (loja ativa)')
cen.req('/api/central/tenant', {'id': TID, 'status': 'ativa'})
V = C(TID)
s, vt = V.req('/api/loja/vitrine'); ids = [p['id'] for p in vt.get('produtos', [])]
check(s == 200 and VES in ids and BLU in ids and OCU not in ids, 'vitrine mostra o que está à venda (sem o escondido)')
vv = next(p for p in vt['produtos'] if p['id'] == VES)
check('estoque' not in vv and all('estoque' not in v for v in vv['variacoes']) and [v['disponivel'] for v in vv['variacoes']] == [True, True, False], 'cliente vê só disponível/esgotado (não a quantidade do estoque)')
check(vt['config']['entrega'] and vt['config']['taxaEntrega'] == 8 and vt['config']['pixChave'] == 'maria@pix', 'vitrine mostra entrega, taxa e PIX')
# 1 P + 2 M do vestido = 3 unidades -> faixa 109,90 cada; + 1 blusa 49,90; entrega 8,00
itens = [{'produtoId': VES, 'variacaoId': VP, 'qtd': 1}, {'produtoId': VES, 'variacaoId': VM, 'qtd': 2}, {'produtoId': BLU, 'qtd': 1}]
CERTO = round(3 * 109.9 + 49.9 + 8, 2)
base = {'cliente': {'nome': 'Ana Souza', 'telefone': '(27) 98888-1111'}, 'entrega': 'entrega', 'endereco': 'Rua A, 1 - Centro', 'pagamento': 'pix', 'itens': itens}
O1, K1 = oid(), chave()
s, r = V.req('/api/loja/pedido', dict(base, id=O1, chave=K1, totalVisto=3 * 129.9 + 49.9 + 8)); check(s == 409 and 'R$ 387,60' in r.get('error', ''), 'total diferente do servidor: recusado com o total certo (%s)' % r.get('error', ''))
s, r = V.req('/api/loja/pedido', dict(base, id=O1, chave=K1, totalVisto=CERTO)); check(s == 200 and r.get('numero') == 1 and r.get('total') == CERTO, 'pedido nº 1 com preço por quantidade somando os tamanhos (R$ %.2f)' % CERTO)
s, r = V.req('/api/loja/pedido', dict(base, id=O1, chave=K1, totalVisto=CERTO)); check(s == 200 and r.get('repetido') and r.get('numero') == 1, 'o mesmo pedido enviado duas vezes grava uma vez')
s, r = V.req('/api/loja/pedido', dict(base, id=O1, chave=chave(), totalVisto=CERTO)); check(s == 409, 'mesmo id com outra chave é recusado')
s, st = A.req('/api/loja/admin/state'); ves = next(p for p in st['produtos'] if p['id'] == VES); blu = next(p for p in st['produtos'] if p['id'] == BLU)
check([v['estoque'] for v in ves['variacoes']] == [1, 3, 0] and blu['estoque'] == 9, 'estoque baixou (P 2→1, M 5→3, blusa 10→9)')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': VES, 'variacaoId': VP, 'qtd': 2}], entrega='retirada', totalVisto=259.8)); check(s == 409 and 'só temos 1' in r.get('error', ''), 'pedir mais que o estoque é recusado')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': VES, 'variacaoId': VG, 'qtd': 1}], entrega='retirada', totalVisto=129.9)); check(s == 409 and 'esgotado' in r.get('error', ''), 'tamanho esgotado é recusado')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': OCU, 'qtd': 1}], entrega='retirada', totalVisto=10)); check(s == 409, 'produto fora da vitrine não é vendido')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], pagamento='cartao', entrega='retirada', totalVisto=49.9)); check(s == 400, 'forma de pagamento que a loja não aceita é recusada')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], cliente={'nome': 'Ana', 'telefone': '123'}, entrega='retirada', totalVisto=49.9)); check(s == 400, 'telefone sem DDD é recusado')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}, {'produtoId': BLU, 'qtd': 2}], entrega='retirada', totalVisto=149.7)); check(s == 400, 'item repetido no carrinho é recusado')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1.5}], entrega='retirada', totalVisto=74.85)); check(s == 400, 'quantidade quebrada é recusada')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': VES, 'qtd': 1}], entrega='retirada', totalVisto=129.9)); check(s == 400, 'produto com tamanhos pedido sem escolher o tamanho é recusado')

# dois clientes ao mesmo tempo pela última peça: só um leva
ULT = xid(); A.req('/api/loja/admin/produto', {'id': ULT, 'nome': 'Peça única', 'preco': 30, 'estoque': 1})
import threading
res = []
def corre():
    res.append(C(TID).req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': ULT, 'qtd': 1}], entrega='retirada', totalVisto=30))[0])
th = [threading.Thread(target=corre) for _ in range(4)]; [t.start() for t in th]; [t.join() for t in th]
check(sorted(res) == [200, 409, 409, 409], 'quatro clientes ao mesmo tempo pela última peça: só um leva (%s)' % sorted(res))
# formulário aberto antes de uma venda não devolve peça que já foi vendida
EST = xid(); A.req('/api/loja/admin/produto', {'id': EST, 'nome': 'Lenço de seda', 'preco': 40, 'estoque': 5})
s, r = C(TID).req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': EST, 'qtd': 4}], entrega='retirada', totalVisto=160))
s, _ = A.req('/api/loja/admin/produto', {'id': EST, 'nome': 'Lenço de seda', 'preco': 45, 'estoque': 5, 'estoqueVisto': 5})
s2, st = A.req('/api/loja/admin/state'); e = next(p for p in st['produtos'] if p['id'] == EST)
check(s == 200 and e['estoque'] == 1 and e['preco'] == 45, 'dona salva o produto aberto antes da venda sem mexer no estoque: o estoque continua 1 (não volta para 5)')
s, r = A.req('/api/loja/admin/produto', {'id': EST, 'nome': 'Lenço de seda', 'preco': 45, 'estoque': 8, 'estoqueVisto': 5}); check(s == 409, 'mexeu no estoque, mas ele mudou desde que abriu: recusa para conferir')
s, _ = A.req('/api/loja/admin/produto', {'id': EST, 'nome': 'Lenço de seda', 'preco': 45, 'estoque': 8, 'estoqueVisto': 1})
s2, st = A.req('/api/loja/admin/state'); check(next(p for p in st['produtos'] if p['id'] == EST)['estoque'] == 8, 'com o estoque conferido, grava o novo (8)')
# estoque em branco ("não controla") continua em branco depois de cancelar
NC = xid(); A.req('/api/loja/admin/produto', {'id': NC, 'nome': 'Meia', 'preco': 10, 'estoque': 5})
s, r = C(TID).req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': NC, 'qtd': 2}], entrega='retirada', totalVisto=20))
A.req('/api/loja/admin/produto', {'id': NC, 'nome': 'Meia', 'preco': 10, 'estoque': None, 'estoqueVisto': 3})
s2, st = A.req('/api/loja/admin/state'); pnc = next(p for p in st['pedidos'] if p['numero'] == r.get('numero'))
A.req('/api/loja/admin/pedido/status', {'id': pnc['id'], 'status': 'cancelado'})
s2, st = A.req('/api/loja/admin/state'); check(next(p for p in st['produtos'] if p['id'] == NC)['estoque'] is None, 'cancelar não volta a controlar estoque de produto que ficou "em branco"')
s, _ = A.req('/api/loja/admin/produto', {'id': xid(), 'nome': 'Preço quebrado', 'preco': '1,005'}); check(s == 400, 'preço com mais de 2 casas é recusado')
TAB, VA, VB = xid(), vid(), vid()
A.req('/api/loja/admin/produto', {'id': TAB, 'nome': 'Bermuda', 'preco': 60, 'grupoVar': 'Tamanho', 'variacoes': [{'id': VA, 'nome': 'M', 'estoque': 5}, {'id': VB, 'nome': 'G', 'estoque': 5}]})
A.req('/api/loja/admin/produto', {'id': TAB, 'nome': 'Bermuda', 'preco': 60, 'grupoVar': 'Tamanho', 'variacoes': [{'id': VB, 'nome': 'G', 'estoque': 5, 'estoqueVisto': 5}], 'estoqueVisto': None})
s, _ = A.req('/api/loja/admin/produto', {'id': TAB, 'nome': 'Bermuda', 'preco': 60, 'grupoVar': 'Tamanho', 'variacoes': [{'id': VA, 'nome': 'M', 'estoque': 5, 'estoqueVisto': 5}, {'id': VB, 'nome': 'G', 'estoque': 5, 'estoqueVisto': 5}], 'estoqueVisto': None})
check(s == 409, 'tamanho apagado em outra aba não volta quando a aba velha salva')
print('== acompanhar e painel')
s, r = C(TID).req('/api/loja/acompanhar?c=' + K1); p1 = r.get('pedido', {})
check(s == 200 and p1.get('numero') == 1 and p1.get('status') == 'novo' and 'clienteTel' not in p1, 'cliente acompanha o pedido pelo link (sem dados extras)')
s, _ = C(TID).req('/api/loja/acompanhar?c=' + chave()); check(s == 404, 'chave errada não acha pedido')
s, _ = C(TX).req('/api/loja/acompanhar?c=' + K1); check(s == 404, 'link de um pedido não abre em outra loja')
s, st = A.req('/api/loja/admin/state'); ped = next(p for p in st['pedidos'] if p['numero'] == 1); PID = ped['id']
check(ped['clienteTel'] == '27988881111' and ped['total'] == CERTO and ped['itens'][0]['precoUnit'] == 109.9, 'painel recebe o pedido com telefone e preços')
s, _ = A.req('/api/loja/admin/pedido/status', {'id': PID, 'status': 'entregue'}); check(s == 409, 'não pula etapas (novo → entregue)')
s, _ = A.req('/api/loja/admin/pedido/status', {'id': PID, 'status': 'confirmado'}); check(s == 200, 'confirma o pedido')
s, r = C(TID).req('/api/loja/acompanhar?c=' + K1); check(r['pedido']['status'] == 'confirmado', 'cliente vê "confirmado"')
s, _ = A.req('/api/loja/admin/pedido/status', {'id': PID, 'status': 'cancelado', 'motivo': 'sem o tecido'}); check(s == 200, 'cancela com motivo')
s, st = A.req('/api/loja/admin/state'); ves = next(p for p in st['produtos'] if p['id'] == VES); blu = next(p for p in st['produtos'] if p['id'] == BLU)
check([v['estoque'] for v in ves['variacoes']] == [2, 5, 0] and blu['estoque'] == 10, 'cancelado: o estoque volta')
s, _ = A.req('/api/loja/admin/pedido/status', {'id': PID, 'status': 'confirmado'}); check(s == 409, 'pedido cancelado não volta')

print('== avaliação (nota e depoimento)')
AVP = xid(); A.req('/api/loja/admin/produto', {'id': AVP, 'nome': 'Caneca', 'preco': 20})
OA, KA = oid(), chave()
s, rp = V.req('/api/loja/pedido', dict(base, id=OA, chave=KA, itens=[{'produtoId': AVP, 'qtd': 1}], entrega='retirada', totalVisto=20))
check(s == 200, 'pedido para testar avaliação')
s, _ = V.req('/api/loja/avaliar', {'chave': KA, 'nota': 5}); check(s == 400, 'não avalia antes de "entregue"')
s, st = A.req('/api/loja/admin/state'); PIDA = next(p for p in st['pedidos'] if p['numero'] == rp['numero'])['id']
A.req('/api/loja/admin/pedido/status', {'id': PIDA, 'status': 'confirmado'})
A.req('/api/loja/admin/pedido/status', {'id': PIDA, 'status': 'pronto'})
s, _ = A.req('/api/loja/admin/pedido/status', {'id': PIDA, 'status': 'entregue'}); check(s == 200, 'pedido chega "entregue"')
s, r = V.req('/api/loja/acompanhar?c=' + KA); check(r['pedido']['podeAvaliar'] is True, 'cliente pode avaliar depois de "entregue"')
s, _ = V.req('/api/loja/avaliar', {'chave': KA, 'nota': 0}); check(s == 400, 'nota 0 é recusada')
s, _ = V.req('/api/loja/avaliar', {'chave': KA, 'nota': 6}); check(s == 400, 'nota 6 é recusada')
s, _ = V.req('/api/loja/avaliar', {'chave': KA, 'nota': 'cinco'}); check(s == 400, 'nota em texto é recusada')
s, _ = V.req('/api/loja/avaliar', {'chave': chave(), 'nota': 5}); check(s == 404, 'chave errada não acha pedido para avaliar')
s, _ = V.req('/api/loja/avaliar', {'chave': KA, 'nota': 5, 'comentario': 'Chegou rápido e <b>certinho</b>!'}); check(s == 200, 'avalia com 5 estrelas e um comentário')
s, r = V.req('/api/loja/acompanhar?c=' + KA)
check(r['pedido']['avaliacaoNota'] == 5 and '<' not in r['pedido']['avaliacaoComentario'] and r['pedido']['podeAvaliar'] is False, 'avaliação salva, sem HTML, e não pode avaliar de novo')
s, _ = V.req('/api/loja/avaliar', {'chave': KA, 'nota': 4}); check(s == 409, 'não avalia duas vezes o mesmo pedido')
s, vt = V.req('/api/loja/vitrine'); AV = vt.get('avaliacoes', {})
check(AV.get('total', 0) >= 1 and AV.get('media') == 5.0, 'vitrine mostra a média e o total de avaliações (%s)' % AV)
check(any(d.get('nome') == 'Ana' and 'rápido' in d.get('comentario', '') for d in AV.get('depoimentos', [])), 'depoimento aparece com o primeiro nome do cliente')
s, _ = C(TID).req('/api/loja/avaliar', {'chave': KA, 'nota': 'x'}); check(s == 400, 'nota inválida sem sessão também é recusada (rota pública)')

print('== importar produtos (planilha e StarIA)')
s, r = A.req('/api/loja/admin/importar', {'itens': []}); check(s == 400, 'importação vazia recusada')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'linha': 2, 'nome': 'Arroz 5kg', 'preco': 25.9, 'codigo': '7891'}, {'linha': 3, 'nome': 'Feijão', 'preco': 'abc'}]})
check(s == 400 and 'Linha 3' in r.get('error', ''), 'linha com preço inválido: nada entra e o erro diz a linha')
s, st = A.req('/api/loja/admin/state'); check(not any(p.get('codigo') == '7891' for p in st['produtos']), 'importação recusada não grava nenhuma linha')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'nome': 'A', 'preco': 1, 'codigo': 'AB1'}, {'nome': 'Bb', 'preco': 1, 'codigo': 'ab1'}]}); check(s == 400, 'nome curto ou código repetido na planilha recusados')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'nome': 'Bolsa', 'preco': 10, 'codigo': 'X<script>'}]}); check(s == 400, 'código com caractere estranho recusado')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'nome': 'Bolsa', 'preco': 10, 'precoDe': 9}]}); check(s == 400, 'preço "de" menor que o preço recusado')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'nome': 'Bolsa', 'preco': 10, 'unidade': 'litro'}]}); check(s == 400, 'unidade fora da lista recusada')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'nome': 'Bolsa', 'preco': 10, 'estoque': 1.5}]}); check(s == 400, 'estoque quebrado recusado')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'nome': 'x', 'preco': 1}] * 1001}); check(s == 400, 'mais de 1000 por vez recusado')
s, r = A.req('/api/loja/admin/importar', {'itens': [
  {'linha': 2, 'codigo': '7891000100103', 'nome': 'Leite Condensado <b>395g</b>', 'preco': '7,49', 'precoDe': 8.99, 'estoque': 48, 'categoria': 'Mercearia', 'custo': 5.2},
  {'linha': 3, 'codigo': 'VEST-001', 'nome': 'Vestido Midi', 'preco': 129.9, 'unidade': 'UN'},
  {'linha': 4, 'nome': 'Brinco sem código', 'preco': 19.9, 'estoque': '7'}]})
check(s == 200 and r.get('criados') == 3 and r.get('atualizados') == 0, 'planilha cria 3 produtos (com e sem código)')
s, st = A.req('/api/loja/admin/state'); leite = next(p for p in st['produtos'] if p.get('codigo') == '7891000100103')
check(leite['preco'] == 7.49 and leite['precoDe'] == 8.99 and leite['estoque'] == 48 and leite['custo'] == 5.2 and '<' not in leite['nome'], 'produto importado com preço, preço de, estoque e custo (nome sem HTML)')
s, vt = C(TID).req('/api/loja/vitrine'); vl = next((p for p in vt['produtos'] if p['id'] == leite['id']), {})
check(vl and 'custo' not in vl and 'codigo' not in vl and 'estoque' not in vl, 'vitrine do cliente não mostra custo, código nem quantidade em estoque')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'codigo': 'vest-001', 'nome': 'Vestido Midi Floral', 'preco': 139.9, 'custo': 60}]})
s2, st = A.req('/api/loja/admin/state'); ve = [p for p in st['produtos'] if (p.get('codigo') or '').lower() == 'vest-001']
check(s == 200 and r.get('atualizados') == 1 and len(ve) == 1 and ve[0]['preco'] == 139.9 and ve[0]['nome'] == 'Vestido Midi Floral' and ve[0]['custo'] == 60, 'mesmo código (maiúscula ou minúscula) atualiza em vez de duplicar')
s, r = A.req('/api/loja/admin/importar', {'itens': [{'codigo': '7891000100103', 'nome': 'Leite Condensado 395g', 'preco': 9.5}]})
s2, st = A.req('/api/loja/admin/state'); leite = next(p for p in st['produtos'] if p.get('codigo') == '7891000100103')
check(s == 200 and leite['preco'] == 9.5 and leite['precoDe'] is None and leite['estoque'] == 48 and leite['categoria'] == 'Mercearia', 'preço novo acima do "de" apaga o riscado; estoque e categoria ficam')
print('-- StarIA')
s, r = A.req('/api/loja/admin/staria/pedir', {'id': 's' + hx(6), 'termos': ['1']}); check(s == 403, 'sem a opção "Importação pelo StarIA" marcada na Central, não pede')
s, r = A.req('/api/loja/admin/staria/pedir', {'id': 's' + hx(6), 'tipo': 'precos'}); check(s == 403, 'sem a opção "Atualização de preço pelo StarIA", não pede preços')
s, r = cen.req('/api/central/tenant', {'id': TID, 'modules': {'l_staria_imp': True}}); check(s == 200 and r['tenant']['modules']['l_staria_imp'] is True, 'Central marca "Importação pelo StarIA"')
SJ = 's' + hx(6)
s, r = A.req('/api/loja/admin/staria/pedir', {'id': SJ, 'termos': ''}); check(s == 400, 'pedido ao StarIA sem código recusado')
s, r = A.req('/api/loja/admin/staria/pedir', {'id': SJ, 'termos': ['123456789012345']}); check(s == 400, 'código com mais de 14 números recusado')
s, r = A.req('/api/loja/admin/staria/pedir', {'id': SJ, 'termos': '7891000100103, 7894900011517\n555 555'})
check(s == 200 and r.get('termos') == 3, 'pede ao StarIA vários códigos de uma vez (repetido conta uma vez)')
s, r = A.req('/api/loja/admin/staria/pedir', {'id': SJ, 'termos': ['1']}); check(s == 200 and r.get('repetido'), 'o mesmo pedido enviado duas vezes grava uma vez')
s, st = A.req('/api/loja/admin/state'); j = next(x for x in st['staria'] if x['id'] == SJ); check(j['status'] == 'pendente' and j['termos'] == ['7891000100103', '7894900011517', '555'], 'pedido aparece como pendente no painel')
s, r = A.req('/api/loja/admin/importar', {'stariaId': SJ, 'itens': [{'nome': 'Coca', 'preco': 5}]}); check(s == 409, 'não importa consulta que o StarIA ainda não respondeu')
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SJ, 'resultados': {'7891000100103': None}}); check(s == 400, 'resultado faltando código recusado')
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SJ, 'resultados': {'7891000100103': None, '7894900011517': None, '555': None, '999': None}}); check(s == 400, 'resultado de código não pedido recusado')
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SJ, 'resultados': {'7891000100103': None, '7894900011517': {'nome': 'X', 'custo': -1}, '555': None}}); check(s == 400, 'custo negativo do StarIA recusado')
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SJ, 'resultados': {'7891000100103': {'codigo': '1001', 'ean': '7891000100103', 'nome': 'LEITE COND <img src=x> 395G', 'custo': 5.35, 'estoque': 120.7, 'fonte': 'última compra'}, '7894900011517': {'codigo': 2002, 'ean': '7894900011517', 'nome': 'REFRI COCA COLA 2L', 'custo': '7.10', 'precoVenda': 9.49, 'estoque': None}, '555': None}})
check(s == 200 and r.get('achados') == 2, 'o Claude devolve o resultado do StarIA (2 achados, 1 não)')
s, st = A.req('/api/loja/admin/state'); j = next(x for x in st['staria'] if x['id'] == SJ); rl = j['resultados']['7891000100103']
check(j['status'] == 'pronta' and '<' not in rl['nome'] and rl['estoque'] == 120 and j['resultados']['555'] is None and j['resultados']['7894900011517']['codigo'] == '2002' and j['resultados']['7894900011517']['precoVenda'] == 9.49, 'resultado fica pronto para revisar (texto limpo, estoque inteiro)')
s, r = A.req('/api/loja/admin/importar', {'stariaId': SJ, 'itens': [{'codigo': '7891000100103', 'nome': 'Leite Condensado 395g', 'preco': 6.96, 'custo': 5.35, 'estoque': 120}, {'codigo': '7894900011517', 'nome': 'Refri Coca-Cola 2L', 'preco': 9.23, 'custo': 7.1, 'categoria': 'Bebidas'}]})
check(s == 200 and r.get('criados') == 1 and r.get('atualizados') == 1, 'importa do StarIA: atualiza o que já tinha e cria o novo')
s, st = A.req('/api/loja/admin/state'); j = next(x for x in st['staria'] if x['id'] == SJ); leite = next(p for p in st['produtos'] if p.get('codigo') == '7891000100103')
check(j['status'] == 'importada' and leite['estoque'] == 120 and leite['preco'] == 6.96, 'consulta fica como importada e o produto com estoque e preço novos')
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SJ, 'resultados': {'7891000100103': None, '7894900011517': None, '555': None}}); check(s == 409, 'consulta já importada não recebe resultado de novo')
S3 = 's' + hx(6); A.req('/api/loja/admin/staria/pedir', {'id': S3, 'termos': ['77']})
s, r = A.req('/api/loja/admin/staria/resultado', {'id': S3, 'resultados': {'77': {'nome': 'ITEM NEGATIVO', 'custo': 1, 'estoque': -3}}})
s2, st = A.req('/api/loja/admin/state'); j3 = next(x for x in st['staria'] if x['id'] == S3)
check(s == 200 and j3['resultados']['77']['estoque'] == 0, 'estoque negativo no ERP vira 0 (não derruba o resultado)')
A.req('/api/loja/admin/staria/excluir', {'id': S3})
P9 = xid(); s, _ = A.req('/api/loja/admin/produto', {'id': P9, 'nome': 'Cinto couro', 'preco': 39.9, 'codigo': 'CT-1', 'custo': '15,50'})
s2, st = A.req('/api/loja/admin/state'); p9 = next(p for p in st['produtos'] if p['id'] == P9)
check(s == 200 and p9['codigo'] == 'CT-1' and p9['custo'] == 15.5, 'formulário do produto grava código e custo')
s, r = A.req('/api/loja/admin/produto', {'id': xid(), 'nome': 'Outro cinto', 'preco': 30, 'codigo': 'ct-1'}); check(s == 409, 'formulário não aceita código que já é de outro produto')
s, _ = A.req('/api/loja/admin/produto', {'id': P9, 'nome': 'Cinto couro marrom', 'preco': 39.9})
s2, st = A.req('/api/loja/admin/state'); p9 = next(p for p in st['produtos'] if p['id'] == P9)
check(s == 200 and p9['codigo'] == 'CT-1' and p9['custo'] == 15.5, 'tela antiga (sem os campos) não apaga código nem custo')
S2 = 's' + hx(6); A.req('/api/loja/admin/staria/pedir', {'id': S2, 'termos': ['42']}); s, _ = A.req('/api/loja/admin/staria/excluir', {'id': S2})
s, st = A.req('/api/loja/admin/state'); check(not any(x['id'] == S2 for x in st['staria']), 'cancela uma consulta pendente')
s, r = C(TID).req('/api/loja/admin/staria/pedir', {'id': 's' + hx(6), 'termos': ['1']}); check(s == 401, 'sem login não pede ao StarIA')
print('-- Atualização de preço pelo StarIA')
cen.req('/api/central/tenant', {'id': TID, 'modules': {'l_staria_preco': True}})
SP = 's' + hx(6)
s, r = A.req('/api/loja/admin/staria/pedir', {'id': SP, 'tipo': 'precos', 'termos': ['999']}); check(s == 200 and r['tipo'] == 'precos', 'pede atualização de preço (o servidor junta os códigos)')
s, r = A.req('/api/loja/admin/staria/pedir', {'id': 's' + hx(6), 'tipo': 'precos'}); check(s == 409, 'só uma atualização de preço esperando por vez')
s, st = A.req('/api/loja/admin/state'); jp = next(x for x in st['staria'] if x['id'] == SP)
cods = [p['codigo'] for p in st['produtos'] if p.get('codigo') and p['codigo'].isdigit()]
check(sorted(jp['termos']) == sorted(set(cods)) and '999' not in jp['termos'] and jp['tipo'] == 'precos', 'os códigos são os dos produtos da loja (ignora o que veio do navegador)')
s, r = A.req('/api/loja/admin/staria/aplicar-precos', {'id': SP}); check(s == 409, 'não aplica antes do StarIA responder')
s, r = A.req('/api/loja/admin/importar', {'stariaId': SP, 'itens': [{'nome': 'Item que não pode entrar', 'preco': 1}]}); print('   importar com pedido de preços ->', s, r.get('error'))
s2, st = A.req('/api/loja/admin/state'); check(s != 200 and not any(p['nome'] == 'Item que não pode entrar' for p in st['produtos']), 'atualização de preço não serve para importar')
LE, CO = '7891000100103', '7894900011517'
res = {c: None for c in jp['termos']}
res[LE] = {'nome': 'LEITE COND', 'precoVenda': 7.49}
res[CO] = {'nome': 'COCA 2L', 'precoVenda': 9.99, 'precoPromo': 8.49, 'promoAte': '2026-11-30'}
bad = dict(res); bad[LE] = {'nome': 'X', 'precoVenda': 0}
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SP, 'resultados': bad}); check(s == 400, 'preço de venda zero recusado')
s, r = A.req('/api/loja/admin/staria/resultado', {'id': SP, 'resultados': res}); check(s == 200, 'StarIA devolve os preços')
s, r = A.req('/api/loja/admin/staria/aplicar-precos', {'id': SP}); check(s == 200 and r['atualizados'] >= 2, 'aplica os preços: %s' % r)
s, st = A.req('/api/loja/admin/state'); pl = next(p for p in st['produtos'] if p.get('codigo') == LE); pc = next(p for p in st['produtos'] if p.get('codigo') == CO)
check(pl['preco'] == 7.49 and pl['precoDe'] is None, 'sem promoção: entra o preço de venda normal')
check(pc['preco'] == 8.49 and pc['precoDe'] == 9.99, 'em promoção: entra o preço da promoção e o normal fica riscado')
s, r = A.req('/api/loja/admin/staria/aplicar-precos', {'id': SP}); check(s == 409, 'não aplica a mesma atualização duas vezes')
SP2 = 's' + hx(6); A.req('/api/loja/admin/staria/pedir', {'id': SP2, 'tipo': 'precos'}); s, st = A.req('/api/loja/admin/state'); jp2 = next(x for x in st['staria'] if x['id'] == SP2)
res2 = {c: None for c in jp2['termos']}; res2[CO] = {'nome': 'COCA 2L', 'precoVenda': 9.99, 'precoPromo': 9.99}
A.req('/api/loja/admin/staria/resultado', {'id': SP2, 'resultados': res2}); s, r = A.req('/api/loja/admin/staria/aplicar-precos', {'id': SP2})
s, st = A.req('/api/loja/admin/state'); pc = next(p for p in st['produtos'] if p.get('codigo') == CO); pl = next(p for p in st['produtos'] if p.get('codigo') == LE)
check(pc['preco'] == 9.99 and pc['precoDe'] is None, 'promoção acabou: volta o preço normal e sai o riscado')
check(pl['preco'] == 7.49, 'produto que o StarIA não achou fica como está')
s, r = C(TID).req('/api/loja/admin/staria/aplicar-precos', {'id': SP2}); check(s == 401, 'sem login não aplica preços')
s, r = C(TID).req('/api/loja/admin/importar', {'itens': [{'nome': 'Hack', 'preco': 1}]}); check(s == 401, 'sem login não importa')
print('== funções desligadas, loja fechada e separação')
cen.req('/api/central/tenant', {'id': TID, 'modules': {'l_volume': False, 'l_entrega': False}})
s, vt = V.req('/api/loja/vitrine'); vv = next(p for p in vt['produtos'] if p['id'] == VES)
check(vv['faixas'] == [] and not vt['config']['entrega'], 'preço por quantidade e entrega desligados: somem da vitrine')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': VES, 'variacaoId': VM, 'qtd': 3}], entrega='retirada', totalVisto=round(3 * 109.9, 2))); check(s == 409, 'sem a função, a faixa não vale (cobra o preço normal)')
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], entrega='entrega', totalVisto=57.9)); check(s == 400, 'sem entrega ligada, pedido com entrega é recusado')
cen.req('/api/central/tenant', {'id': TID, 'modules': {'l_volume': True, 'l_entrega': True}})
A.req('/api/loja/admin/config', {'aberta': False, 'pagamentos': ['pix', 'dinheiro']})
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], entrega='retirada', totalVisto=49.9)); check(s == 403, 'loja fechada não recebe pedido')
A.req('/api/loja/admin/config', {'aberta': True, 'pagamentos': ['pix', 'dinheiro'], 'pedidoMinimo': 100})
s, r = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], entrega='retirada', totalVisto=49.9)); check(s == 400 and 'mínimo' in r.get('error', ''), 'pedido abaixo do mínimo é recusado')
A.req('/api/loja/admin/config', {'aberta': True, 'pagamentos': ['pix', 'dinheiro'], 'pedidoMinimo': 0})
X = C(TX); X.req('/api/login', {'role': 'admin', 'login': 'zemercado', 'password': X0}); XP = pw(); X.req('/api/password', {'current': X0, 'next': XP})
s, sx = X.req('/api/loja/admin/state'); check(s == 200 and not sx['produtos'] and not sx['pedidos'], 'outra loja não vê produtos nem pedidos da Maria')
s, _ = X.req('/api/loja/admin/pedido/status', {'id': PID, 'status': 'confirmado'}); check(s == 404, 'outra loja não mexe em pedido da Maria')
s, _ = X.req('/api/loja/admin/produto/excluir', {'id': VES}); s2, st = A.req('/api/loja/admin/state'); check(any(p['id'] == VES for p in st['produtos']), 'outra loja não apaga produto da Maria')
s, _ = X.req('/api/loja/admin/produto', {'id': BLU, 'nome': 'Sequestro', 'preco': 1, 'fotos': [F1]}); check(s == 400, 'outra loja não usa a foto da Maria')
s, _ = A.req('/api/loja/admin/state', tenant=TX); check(s == 401, 'sessão da Maria não vale no endereço de outra loja')
D = C('@'); D.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW})
s, _ = D.req('/api/loja/admin/state'); check(s == 404, 'empresa de atacado não tem o painel da loja')
s, _ = C('@').req('/api/loja/vitrine'); check(s == 404, 'empresa de atacado não tem vitrine')
s, _ = V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), totalVisto=CERTO), headers={'Content-Type': 'application/json', 'X-Tenant': TID}); check(s == 403, 'pedido sem o cabeçalho do app é recusado (CSRF)')
cen.req('/api/central/tenant', {'id': TID, 'status': 'suspensa'})
s, _ = V.req('/api/loja/vitrine'); check(s == 403, 'loja suspensa: vitrine fechada')
cen.req('/api/central/tenant', {'id': TID, 'status': 'ativa'})
s, st = cen.req('/api/central/state'); tm = next(t for t in st['tenants'] if t['id'] == TID); check(tm['stats']['lojaProdutos'] == 13 and tm['stats']['lojaPedidos'] == 5, 'Central mostra produtos e pedidos da loja (%s)' % tm['stats'])

s, img, h = C(None).req('/api/loja/foto/%E0%A4%A?t=' + TID, raw=True, headers={}); check(s == 404, 'endereço de foto malformado dá 404 (não erro do servidor)')

print('== conversão: entrega grátis a partir de X, cupons, "Peça junto", escassez (loja nova "Doce Lar")')
s, r = cen.req('/api/central/tenant', {'name': 'Doce Lar', 'ramo': 'loja'}); TD = r['tenant']['id']; cen.req('/api/central/tenant', {'id': TD, 'status': 'ativa'})
s, r = cen.req('/api/central/tenant-admin', {'id': TD, 'login': 'doce'}); D0 = r['password']
DA = C(TD); DA.req('/api/login', {'role': 'admin', 'login': 'doce', 'password': D0}); DP = pw(); DA.req('/api/password', {'current': D0, 'next': DP})
s, st = DA.req('/api/loja/admin/state'); check(s == 200 and st['config']['entregaGratisDe'] == 0 and st['config']['cupons'] == [] and st['config']['tempoPreparo'] == 0, 'loja nova: sem entrega grátis, sem cupom, sem previsão (padrões)')
CUPONS = [{'codigo': 'dez', 'tipo': 'pct', 'valor': 10, 'minimo': 50}, {'codigo': 'CINCO', 'tipo': 'reais', 'valor': 5}, {'codigo': 'VENCIDO', 'tipo': 'pct', 'valor': 10, 'validade': '2020-01-01'},
          {'codigo': 'PRIMEIRA', 'tipo': 'reais', 'valor': 10, 'primeiraCompra': True}, {'codigo': 'PAUSA', 'tipo': 'pct', 'valor': 50, 'ativo': False}]
CFG = {'whatsapp': '27 98888-0000', 'pagamentos': ['pix', 'dinheiro'], 'retirada': True, 'entrega': True, 'taxaEntrega': 8, 'entregaGratisDe': '80,00', 'tempoPreparo': '40', 'entregaHoje': 'Entrega hoje até 18h', 'cupons': CUPONS}
s, r = DA.req('/api/loja/admin/config', dict(CFG, cupons=[{'codigo': 'A-B!', 'tipo': 'pct', 'valor': 10}])); check(s == 400, 'cupom com símbolo no código é recusado')
s, r = DA.req('/api/loja/admin/config', dict(CFG, cupons=[{'codigo': 'X1', 'tipo': 'pct', 'valor': 150}])); check(s == 400, 'cupom de 150% é recusado')
s, r = DA.req('/api/loja/admin/config', dict(CFG, cupons=[{'codigo': 'X1', 'tipo': 'pct', 'valor': 10}, {'codigo': 'x1', 'tipo': 'reais', 'valor': 1}])); check(s == 400, 'dois cupons com o mesmo código são recusados')
s, r = DA.req('/api/loja/admin/config', dict(CFG, tempoPreparo='abc')); check(s == 400, 'tempo de preparo que não é número é recusado')
s, r = DA.req('/api/loja/admin/config', CFG); check(s == 200, 'configura entrega R$ 8 grátis a partir de R$ 80, previsão e 5 cupons')
s, st = DA.req('/api/loja/admin/state'); cc = st['config']
check(cc['entregaGratisDe'] == 80 and cc['tempoPreparo'] == 40 and cc['entregaHoje'] == 'Entrega hoje até 18h' and [c['codigo'] for c in cc['cupons']] == ['DEZ', 'CINCO', 'VENCIDO', 'PRIMEIRA', 'PAUSA'] and cc['cupons'][0]['minimo'] == 50 and cc['cupons'][4]['ativo'] is False, 'painel vê a configuração (código do cupom vira maiúsculo)')
s, r = DA.req('/api/loja/admin/config', {'whatsapp': '27 98888-0000', 'pagamentos': ['pix', 'dinheiro'], 'retirada': True, 'entrega': True, 'taxaEntrega': 8})
s, st = DA.req('/api/loja/admin/state'); cc = st['config']
check(cc['entregaGratisDe'] == 80 and len(cc['cupons']) == 5 and cc['tempoPreparo'] == 40, 'tela antiga (sem os campos novos) salva sem apagar entrega grátis, cupons e previsão')
BOLO, TORTA, COOKIE, BRIG, ESG, VAR, VV1, VV2 = xid(), xid(), xid(), xid(), xid(), xid(), vid(), vid()
for pid, nome, preco, cat, extra in [(BOLO, 'Bolo de cenoura', 40, 'Bolos', {'estoque': 5}), (TORTA, 'Torta de limão', 42, 'Bolos', {}), (COOKIE, 'Cookie', 6, 'Doces', {}), (BRIG, 'Brigadeiro', 24, 'Doces', {}), (ESG, 'Pavê esgotado', 10, 'Doces', {'estoque': 0}),
                                     (VAR, 'Bolo no pote', 12, 'Bolos', {'grupoVar': 'Sabor', 'variacoes': [{'id': VV1, 'nome': 'Ninho', 'estoque': 2}, {'id': VV2, 'nome': 'Limão', 'estoque': 0}]})]:
    DA.req('/api/loja/admin/produto', dict({'id': pid, 'nome': nome, 'preco': preco, 'categoria': cat}, **extra))
DV = C(TD)
s, vt = DV.req('/api/loja/vitrine'); vc = vt['config']; P = {p['id']: p for p in vt['produtos']}
check(vc['entregaGratisDe'] == 80 and vc['tempoPreparo'] == 40 and vc['entregaHoje'] == 'Entrega hoje até 18h' and vc['temCupom'] is True and 'cupons' not in vc, 'vitrine mostra entrega grátis a partir de R$ 80, previsão e que existe cupom (sem os códigos)')
check(P[BOLO]['restam'] == 5 and P[TORTA]['restam'] is None and P[BOLO]['vendidos'] == 0 and 'estoque' not in P[BOLO] and P[ESG]['disponivel'] is False, 'cliente vê "restam 5" (escassez verdadeira) e vendidos, mas não o estoque; esgotado marcado')
check([v['restam'] for v in P[VAR]['variacoes']] == [2, None] and [v['disponivel'] for v in P[VAR]['variacoes']] == [True, False], 'sabor com 2 unidades mostra "só 2"; sabor esgotado não mostra')
check(TORTA in P[BOLO]['junto'] and BOLO not in P[BOLO]['junto'] and ESG not in P[BOLO]['junto'] and all(ESG not in p['junto'] and p['id'] not in p['junto'] for p in vt['produtos']), 'sem pedidos ainda, "Peça junto" cai na mesma categoria: nunca o próprio, nunca esgotado')
s, r = DV.req('/api/loja/cupom?c=dez'); check(s == 200 and r['cupom']['codigo'] == 'DEZ' and r['cupom']['tipo'] == 'pct' and r['cupom']['valor'] == 10 and r['cupom']['minimo'] == 50, 'cliente confere o cupom DEZ (minúsculo vale)')
s, r = DV.req('/api/loja/cupom?c=VENCIDO'); check(s == 410 and 'venceu' in r.get('error', ''), 'cupom vencido: avisa que venceu')
s, r = DV.req('/api/loja/cupom?c=PAUSA'); check(s == 410, 'cupom desativado não vale')
s, r = DV.req('/api/loja/cupom?c=NADA'); check(s == 404, 'cupom que não existe: não encontrado')
s, r = DV.req('/api/loja/cupom?c='); check(s == 400, 'cupom em branco: pede o código')
bd = {'cliente': {'nome': 'Bia Lima', 'telefone': '(27) 97777-0001'}, 'entrega': 'entrega', 'endereco': 'Rua B, 2 - Centro', 'pagamento': 'pix'}
def limpa():  # confirma os pedidos novos (o limite de 5 pedidos esperando por aparelho não atrapalha o teste)
    s, st = DA.req('/api/loja/admin/state')
    for p in st['pedidos']:
        if p['status'] == 'novo': DA.req('/api/loja/admin/pedido/status', {'id': p['id'], 'status': 'confirmado'})
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': BOLO, 'qtd': 1}], totalVisto=48)); check(s == 200 and r['taxaEntrega'] == 8 and r['total'] == 48, 'R$ 40 de produtos: paga a entrega (R$ 8)')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': TORTA, 'qtd': 2}], totalVisto=92)); check(s == 409 and 'R$ 84,00' in r.get('error', ''), 'R$ 84 de produtos com a taxa somada: o servidor recusa e diz o total certo (sem taxa)')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': TORTA, 'qtd': 2}], totalVisto=84)); check(s == 200 and r['taxaEntrega'] == 0 and r['total'] == 84, 'R$ 84 de produtos: entrega grátis no servidor')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', cupom='DEZ', totalVisto=5.4)); check(s == 400 and 'R$ 50,00' in r.get('error', ''), 'cupom DEZ num pedido de R$ 6: abaixo do mínimo de R$ 50')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': TORTA, 'qtd': 2}], entrega='retirada', cupom='dez', totalVisto=84)); check(s == 409 and 'R$ 75,60' in r.get('error', ''), 'com cupom, o total visto sem o desconto é recusado (diz R$ 75,60)')
K2 = chave(); s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=K2, itens=[{'produtoId': TORTA, 'qtd': 2}], entrega='retirada', cupom='dez', totalVisto=75.6)); check(s == 200 and r['desconto'] == 8.4 and r['cupom'] == 'DEZ' and r['total'] == 75.6, 'cupom DEZ (10%) em R$ 84: desconto R$ 8,40, total R$ 75,60')
s, r = DV.req('/api/loja/acompanhar?c=' + K2); check(s == 200 and r['pedido']['cupom'] == 'DEZ' and r['pedido']['desconto'] == 8.4, 'cliente vê o cupom e o desconto no acompanhamento')
limpa()
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', cupom='VENCIDO', totalVisto=5.4)); check(s == 410, 'cupom vencido não entra no pedido')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', cupom='PAUSA', totalVisto=3)); check(s == 410, 'cupom desativado não entra no pedido')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', cupom='NADA', totalVisto=6)); check(s == 404, 'cupom inexistente não entra no pedido')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='entrega', cupom='CINCO', totalVisto=9)); check(s == 200 and r['desconto'] == 5 and r['total'] == 9, 'cupom CINCO (R$ 5) no cookie de R$ 6 com entrega: 6 − 5 + 8 = R$ 9')
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', cupom='PRIMEIRA', totalVisto=0)); check(s == 400 and 'primeira compra' in r.get('error', ''), 'cupom "só primeira compra": WhatsApp que já pediu é recusado')
nova = dict(bd, cliente={'nome': 'Caio Novo', 'telefone': '27 96666-0002'})
s, r = DV.req('/api/loja/pedido', dict(nova, id=oid(), chave=chave(), itens=[{'produtoId': BRIG, 'qtd': 1}], entrega='retirada', cupom='primeira', totalVisto=14)); check(s == 200 and r['desconto'] == 10 and r['total'] == 14, 'cupom "só primeira compra": WhatsApp novo usa (R$ 24 − 10)')
s, r = DV.req('/api/loja/pedido', dict(nova, id=oid(), chave=chave(), itens=[{'produtoId': BRIG, 'qtd': 1}], entrega='retirada', cupom='PRIMEIRA', totalVisto=14)); check(s == 400, 'o mesmo WhatsApp não usa o cupom de primeira compra de novo')
limpa()
# "Peça junto": bolo e cookie saem juntos em dois pedidos; o pavê esgotado nunca aparece
for _ in range(2):
    s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': BOLO, 'qtd': 1}, {'produtoId': COOKIE, 'qtd': 2}, {'produtoId': BRIG, 'qtd': 1}], entrega='retirada', totalVisto=76))
    check(s == 200, 'pedido com bolo + cookie + brigadeiro (%s)' % r.get('error', ''))
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': BOLO, 'qtd': 1}, {'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', totalVisto=46)); check(s == 200, 'pedido com bolo + cookie')
s, vt = DV.req('/api/loja/vitrine'); P = {p['id']: p for p in vt['produtos']}
check(P[BOLO]['junto'][0] == COOKIE and P[BOLO]['junto'][1] == BRIG and BOLO not in P[BOLO]['junto'] and ESG not in P[BOLO]['junto'] and len(P[BOLO]['junto']) <= 3, '"Peça junto" do bolo: cookie (3 pedidos juntos) e depois brigadeiro (2); nunca o próprio nem esgotado (%s)' % [P[BOLO]['junto']])
check(P[COOKIE]['junto'][0] == BOLO and ESG not in P[COOKIE]['junto'], '"Peça junto" do cookie começa pelo bolo')
check(all(p['id'] not in p['junto'] and ESG not in p['junto'] for p in vt['produtos']), 'nenhum produto sugere ele mesmo nem o esgotado')
check(P[BOLO]['vendidos'] == 4 and P[BOLO]['restam'] == 1 and P[COOKIE]['vendidos'] == 6, 'vitrine: bolo vendeu 4 e restam só 1; cookie vendeu 6')
s, st = DA.req('/api/loja/admin/state'); uso = st.get('cuponsUso', {})
check(uso.get('DEZ') == 1 and uso.get('CINCO') == 1 and uso.get('PRIMEIRA') == 1 and 'VENCIDO' not in uso, 'painel conta quantas vezes cada cupom foi usado (%s)' % uso)
pc = next(p for p in st['pedidos'] if p.get('cupom') == 'DEZ'); check(pc['desconto'] == 8.4 and pc['total'] == 75.6, 'painel vê o cupom e o desconto no pedido')
s, html, h = C(None).req('/t/' + TD + '/loja', raw=True); js = C(None).req('/loja.js', raw=True, headers={})[1]
check(s == 200 and b'#p/' in js and b'/api/loja/cupom' in js and 'Peça junto'.encode() in js, 'vitrine do cliente tem a rota #p/<id>, o cupom e o "Peça junto"')
print('== segurança da vitrine: cupom de outra loja, cupom malformado, validade impossível, corrida da primeira compra')
import concurrent.futures as cf
s, r = C(TX).req('/api/loja/cupom?c=DEZ'); check(s in (403, 404), 'cupom de uma loja não vale na vitrine de outra (%s)' % s)
s, r = DV.req('/api/loja/pedido', dict(bd, id=oid(), chave=chave(), itens=[{'produtoId': COOKIE, 'qtd': 1}], entrega='retirada', cupom=['DEZ'], totalVisto=6)); check(s == 400, 'cupom que não é texto é recusado (%s)' % s)
s, r = DA.req('/api/loja/admin/config', dict(CFG, cupons=[{'codigo': 'AB', 'tipo': 'pct', 'valor': 5, 'validade': '2026-13-45'}])); check(s == 400, 'validade impossível (2026-13-45) é recusada')
s, r = DA.req('/api/loja/admin/config', dict(CFG, cupons='x')); check(s == 400, 'cupons que não são lista: recusado (um envio errado não apaga os cupons)')
s, st = DA.req('/api/loja/admin/state'); check(len(st['config']['cupons']) == 5, 'os 5 cupons continuam lá')
PS = [xid() for _ in range(6)]
for i, pid in enumerate(PS): DA.req('/api/loja/admin/produto', {'id': pid, 'nome': 'Doce %d' % i, 'preco': 20, 'categoria': 'Doces'})
par = dict(bd, cliente={'nome': 'Dudu Paralelo', 'telefone': '27 95555-0003'}, entrega='retirada', cupom='PRIMEIRA', totalVisto=10)
def pede(k): return C(TD).req('/api/loja/pedido', dict(par, id=oid(), chave=chave(), itens=[{'produtoId': PS[k], 'qtd': 1}]))
with cf.ThreadPoolExecutor(6) as ex: R = list(ex.map(pede, range(6)))
check(sum(1 for s, r in R if s == 200 and r.get('desconto') == 10) == 1 and all(s in (200, 400) for s, _ in R), '6 pedidos ao mesmo tempo do mesmo WhatsApp com cupom de primeira compra: só 1 leva o desconto (%s)' % [s for s, _ in R])
limpa()
print('== limite de pedidos por aparelho (por último)')
codes = [V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], entrega='retirada', totalVisto=49.9))[0] for _ in range(30)]
check(429 in codes and codes.count(200) <= 5, 'muitos pedidos seguidos do mesmo aparelho/telefone são barrados, e ninguém segura estoque com mais de 5 pedidos esperando (%s)' % codes)

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

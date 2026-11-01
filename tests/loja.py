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
check(s == 200 and T.get('ramo') == 'loja' and T['status'] == 'em_preparo' and all(T['modules'].values()), 'cria a loja online "Ateliê Maria", em preparo, com todas as funções')
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
s, st = cen.req('/api/central/state'); tm = next(t for t in st['tenants'] if t['id'] == TID); check(tm['stats']['lojaProdutos'] == 6 and tm['stats']['lojaPedidos'] == 4, 'Central mostra produtos e pedidos da loja (%s)' % tm['stats'])

print('== limite de pedidos por aparelho (por último)')
codes = [V.req('/api/loja/pedido', dict(base, id=oid(), chave=chave(), itens=[{'produtoId': BLU, 'qtd': 1}], entrega='retirada', totalVisto=49.9))[0] for _ in range(30)]
check(429 in codes, 'muitos pedidos seguidos do mesmo aparelho são barrados (%s)' % codes[-3:])

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

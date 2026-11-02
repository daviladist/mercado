"""Testes de tela (navegador de verdade) de cada papel, num banco de TESTE com o administrador da principal criado.
Roteiros: cliente faz pedido; vendedor aprova troca; conferente e entregador navegam; faturamento fatura;
caixa (PDV) vende; e a fila do app não perde nada quando o servidor recusa o envio inteiro.
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/telas.py   (precisa de: pip install playwright; playwright install chromium)
Sai com código 1 se algo falhar. Bibliotecas de PDF/planilha do CDN são trocadas por um substituto (o teste não depende da internet).
"""
import json, os, re, sys, datetime, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077')
CPW = os.environ['CENTRAL_PASSWORD']; AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg, flush=True)
    else: fails.append(msg); print('  FALHA', msg, flush=True)
class C:
    def __init__(self, t='@'):
        self.t = t; self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def req(self, path, body=None):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if self.t: h['X-Tenant'] = self.t
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: return x.status, json.loads(x.read() or b'{}')
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')

PW = 'SenhaBase12345'; NPW = PW + 'N'
PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
hoje = str(datetime.date.today())
A = C(); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador entra')
cen = C(None); cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW})
s, cs = cen.req('/api/central/state'); dav = next(t for t in cs['tenants'] if t['primary'])
s, _ = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'pdv': True, 'app_cliente': True}}); check(s == 200, 'Central liga caixa e app do cliente')
def o(i, st, extra=None):
    d = {'id': i, 'date': hoje + 'T12:00:00.000Z', 'customerId': 'cl1', 'customer': 'Mercado Um', 'sellerId': 's1', 'sellerRate': 2, 'status': st, 'pay': 'Boleto 28 dias', 'mode': 'entrega', 'addr': 'Rua A, 10',
         'items': [{'pid': 'pa', 'name': 'Arroz 5kg', 'unit': 'Fardo', 'perPack': 6, 'q': 4, 'price': 25, 'base': 25, 'cost': 20}, {'pid': 'pk', 'name': 'Queijo', 'unit': 'KG', 'kg': True, 'q': 1.5, 'price': 40, 'base': 40}],
         'sub': 160, 'disc': 0, 'total': 160}
    d.update(extra or {}); return {'c': 'orders', 'id': i, 'op': 'put', 'doc': d}
ch = [{'c': 'meta', 'id': 'store', 'op': 'put', 'doc': {'name': 'LOJA TESTE', 'min': 0, 'pickupDisc': 2}},
      {'c': 'meta', 'id': 'payments', 'op': 'put', 'doc': ['PIX', 'Dinheiro', 'Boleto 28 dias']},
      {'c': 'categories', 'id': 'cat1', 'op': 'put', 'doc': {'id': 'cat1', 'name': 'Mercearia', 'subs': []}},
      {'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'Arroz 5kg', 'price': 25, 'cost': 20, 'unit': 'Fardo', 'perPack': 6, 'stock': 40, 'cat': 'Mercearia', 'code': '101', 'ean': '7890000000017', 'active': True, 'photo': PNG}},
      {'c': 'products', 'id': 'pk', 'op': 'put', 'doc': {'id': 'pk', 'name': 'Queijo', 'price': 40, 'cost': 30, 'unit': 'KG', 'kg': True, 'stock': 10, 'cat': 'Mercearia', 'code': '102', 'active': True}},
      {'c': 'products', 'id': 'pb', 'op': 'put', 'doc': {'id': 'pb', 'name': 'Feijão', 'price': 9, 'cost': 7, 'unit': 'UN', 'stock': '', 'cat': 'Mercearia', 'code': '103', 'active': True}},
      {'c': 'sellers', 'id': 's1', 'op': 'put', 'doc': {'id': 's1', 'name': 'Vendedor Zé', 'login': 'vend1', 'pass': PW, 'commission': 2}},
      {'c': 'customers', 'id': 'cl1', 'op': 'put', 'doc': {'id': 'cl1', 'name': 'Mercado Um', 'login': 'cli1', 'pass': PW, 'sellerId': 's1', 'doc': '11222333000181', 'creditLimit': 5000, 'address': 'Rua A, 10'}},
      {'c': 'checkers', 'id': 'k1', 'op': 'put', 'doc': {'id': 'k1', 'name': 'Conferente', 'login': 'conf1', 'pass': PW}},
      {'c': 'billers', 'id': 'b1', 'op': 'put', 'doc': {'id': 'b1', 'name': 'Faturista', 'login': 'fat1', 'pass': PW}},
      {'c': 'vehicles', 'id': 'd1', 'op': 'put', 'doc': {'id': 'd1', 'driver': 'Motorista', 'car': 'Fiorino', 'login': 'ent1', 'pass': PW}},
      {'c': 'cashiers', 'id': 'x1', 'op': 'put', 'doc': {'id': 'x1', 'name': 'Operador', 'login': 'cx1', 'pass': PW}},
      o('o1', 'novo'), o('o2', 'separando', {'sugs': [{'id': 'sg1', 'type': 'troca', 'status': 'pendente', 'fromKey': 'pa', 'fromName': 'Arroz 5kg', 'pid': 'pb', 'name': 'Feijão', 'q': 2, 'toSeller': True, 'by': 'Conferente', 'at': hoje}], 'chk': {'pk': True}}),
      o('o3', 'separado'), o('o4', 'pronto', {'deliv': {'drv': 'd1', 'at': hoje}, 'billed': {'at': hoje, 'by': 'Fat', 'nf': ''}}),
      o('o5', 'saiu', {'deliv': {'drv': 'd1', 'at': hoje}, 'billed': {'at': hoje, 'by': 'Fat', 'nf': ''}}),
      o('o6', 'concluido', {'deliv': {'drv': 'd1'}, 'delivered': {'at': hoje, 'name': 'Zé', 'photo': PNG, 'how': 'dinheiro', 'drv': 'd1', 'settled': False}}), o('o7', 'cancelado')]
s, r = A.req('/api/sync', {'changes': ch}); check(s == 200 and not r.get('rejected'), 'dados de exemplo gravados: %s' % (r.get('rejected') or r.get('error') or ''))
for lg, role in [('vend1', 'vendedor'), ('cli1', 'cliente'), ('conf1', 'conferente'), ('fat1', 'faturamento'), ('ent1', 'entregador'), ('cx1', 'operador_caixa')]:
    x = C(); x.req('/api/login', {'role': role, 'login': lg, 'password': PW}); s, _ = x.req('/api/password', {'current': PW, 'next': NPW}); check(s == 200, 'senha própria de ' + role)
def order(i): return next((x for x in A.req('/api/state')[1]['S']['orders'] if x['id'] == i), None)

STUB = "window.jspdf={jsPDF:function(){const d={internal:{pageSize:{getWidth:()=>297,getHeight:()=>210}},lastAutoTable:{finalY:50}};const P=new Proxy(d,{get:(t,k)=>k in t?t[k]:k==='getNumberOfPages'?()=>1:k==='output'?()=>new ArrayBuffer(8):()=>P});return P}};"
APP = None
def route(r, expose=False):
    u = r.request.url
    if u.startswith(BASE):
        if expose and u.split('?')[0].endswith('/app.js'):
            src = urllib.request.urlopen(u).read().decode(); i = src.rstrip().rfind('})();')
            return r.fulfill(body=src[:i] + 'window.__T={S:()=>S,save:()=>save()};\n' + src[i:], content_type='text/javascript')
        return r.continue_()
    if 'jspdf.umd' in u: return r.fulfill(body=STUB, content_type='text/javascript')
    if 'cdnjs' in u: return r.fulfill(body='', content_type='text/javascript')
    return r.abort()
def start(pw, path, lg, desk=False, expose=False):
    b = pw.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 860} if desk else {'width': 390, 'height': 844})
    ctx.route('**/*', lambda r: route(r, expose))
    pg = ctx.new_page(); E = []
    pg.on('pageerror', lambda e: E.append('erro de JavaScript: ' + str(e)[:200]))
    pg.on('console', lambda m: E.append('console: ' + m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.goto(BASE + path); pg.wait_for_selector('input[type=password]', timeout=20000)
    pg.locator('input[autocomplete=username]').first.fill(lg); pg.fill('input[type=password]', NPW if lg != AL else APW); pg.keyboard.press('Enter')
    pg.wait_for_function("() => !document.querySelector('input[type=password]') || !document.querySelector('input[type=password]').offsetParent", timeout=20000)
    pg.wait_for_timeout(800)
    return b, pg, E
def alert(pg):
    a = pg.locator('#srvalert'); return a.first.inner_text().replace('\n', ' ') if a.count() and a.first.is_visible() else ''
def wait_sync(pg):
    pg.wait_for_timeout(400)
    for _ in range(50):
        if not pg.locator('#srvbadge:not([hidden])').count(): break
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
SAFE = re.compile(r'^(sair|senha|apagar|excluir|desativar|desfazer|sair da conta)$|cancelar|fechar caixa|apagar|excluir', re.I)
def browse(pg, n=15):
    """clica nos botões de navegação da tela (sem ações destrutivas) e volta erros de JavaScript"""
    seen = set(); clicks = 0
    for _ in range(n * 3):
        if clicks >= n: break
        c = pg.evaluate("""() => { const L = [...document.querySelectorAll('button, [role=tab], summary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && !e.closest('#srvalert'); });
            return L.map((e, i) => [i, (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 40), [...e.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value).join(',')]); }""")
        nxt = next((x for x in c if (x[1] + '|' + x[2]) not in seen and not SAFE.search(x[1] or '')), None)
        if not nxt: break
        seen.add(nxt[1] + '|' + nxt[2])
        try:
            pg.evaluate("i => { const L = [...document.querySelectorAll('button, [role=tab], summary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && !e.closest('#srvalert'); }); L[i] && L[i].click(); }", nxt[0])
            clicks += 1; pg.wait_for_timeout(250)
        except Exception: pass
    return clicks

with sync_playwright() as pw:
    print('== cliente faz pedido pelo app')
    b, pg, E = start(pw, '/cliente', 'cli1')
    pg.click('[data-add=pb]'); pg.click('[data-add=pk]'); pg.click('#openCart'); pg.click('[data-mode=entrega]'); pg.select_option('#pay', 'Boleto 28 dias'); pg.click('#finish')
    pg.wait_for_selector('text=ENVIADO', timeout=15000); txt = pg.inner_text('#app').replace('\xa0', ' ')
    check('R$ 49,00' in txt, 'pedido enviado com o total certo (9 + 40): ' + txt[:80].replace('\n', ' '))
    pg.click('[data-cp=pedidos]'); pg.wait_for_timeout(500); pg.click('[data-cp=dados]'); pg.wait_for_timeout(500)
    check(not E, 'cliente sem erro de JavaScript: %s' % E[:2]); b.close()
    s, st = A.req('/api/state'); check(any(x['customerId'] == 'cl1' and abs(x['total'] - 49) < 0.01 and x['status'] == 'novo' for x in st['S']['orders']), 'pedido do cliente chegou na loja')

    print('== vendedor aprova a troca pedida na separação')
    b, pg, E = start(pw, '/#vendedor', 'vend1')
    pg.wait_for_selector('[data-vsok="o2|sg1"]', timeout=15000); pg.click('[data-vsok="o2|sg1"]'); wait_sync(pg)
    check(not alert(pg), 'aprovação gravada sem aviso de recusa (%s)' % alert(pg))
    x = order('o2'); check(x and x['sugs'][0]['status'] == 'aprovada' and x['items'][0]['pid'] == 'pb', 'na loja: troca aprovada e item trocado')
    browse(pg, 12); check(not E, 'vendedor sem erro de JavaScript: %s' % E[:2]); b.close()

    print('== conferente e entregador navegam pelas telas')
    for path, lg, nome in [('/#conferente', 'conf1', 'conferente'), ('/#entregador', 'ent1', 'entregador')]:
        b, pg, E = start(pw, path, lg); n = browse(pg, 15)
        check(n >= 3 and not E, '%s: %d cliques, sem erro de JavaScript: %s' % (nome, n, E[:2])); b.close()

    print('== faturamento')
    b, pg, E = start(pw, '/#faturamento', 'fat1')
    pg.locator('button', has_text='Em separação').first.click(); pg.wait_for_timeout(400)
    check(pg.locator('[data-fok="o1"]').count() == 0 and pg.locator('text=Fatura depois que a conferência terminar').count() > 0, 'pedido em separação não mostra "Faturado" (o servidor recusaria)')
    pg.locator('button', has_text='A faturar').first.click(); pg.wait_for_timeout(400)
    pg.wait_for_selector('[data-fok="o3"]', timeout=10000); pg.click('[data-fok="o3"]'); wait_sync(pg)
    x = order('o3'); check(x and x.get('billed') and not alert(pg), 'pedido separado faturado (%s)' % alert(pg))
    browse(pg, 10); check(not E, 'faturamento sem erro de JavaScript: %s' % E[:2]); b.close()

    print('== caixa (PDV) vende')
    b, pg, E = start(pw, '/pdv', 'cx1', desk=True)
    if pg.locator('#pdvaf').count(): pg.fill('#pdvaf', '100'); pg.locator('button', has_text='Abrir caixa').click(); pg.wait_for_selector('#pdvc', timeout=10000)
    for code in ['7890000000017', '7890000000017', '103', '2*103']:
        pg.fill('#pdvc', code); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    try: pg.wait_for_function("() => document.body.innerText.replace(/\\u00a0/g, ' ').includes('R$ 77,00')", timeout=10000)
    except Exception: pass
    body = pg.inner_text('body').replace('\xa0', ' '); check('R$ 77,00' in body, 'mesmo produto soma na linha; total R$ 77,00 (2×25 + 3×9)')
    pg.keyboard.press('F10'); pg.wait_for_selector('#pdvpv', timeout=10000); pg.select_option('#pdvpf', index=0); pg.fill('#pdvpv', '100'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    pg.keyboard.press('F10'); pg.wait_for_selector('text=concluída', timeout=10000)
    check('23,00' in pg.inner_text('body'), 'venda concluída com troco de R$ 23,00')
    check(not E, 'caixa sem erro de JavaScript: %s' % E[:2]); b.close()

    print('== fila do app: recusa do envio inteiro não perde nada')
    b, pg, E = start(pw, '/#admin', AL, desk=True, expose=True)
    calls = []
    def sync_route(r):
        body = r.request.post_data or ''
        calls.append(body.count('"c":'))
        if 'prod-ruim' in body: return r.fulfill(status=400, body=json.dumps({'error': 'Envio inválido.'}), content_type='application/json')
        return r.fallback()
    pg.route('**/api/sync', sync_route)
    pg.evaluate("""() => { const S = __T.S(); ['prod-bom1', 'prod-ruim', 'prod-bom2'].forEach(id => S.products.push({ id, name: id, price: 5, unit: 'UN', active: true })); __T.save(); }""")
    pg.wait_for_timeout(4000); wait_sync(pg)
    ids = {p['id'] for p in A.req('/api/state')[1]['S']['products']}
    check('prod-bom1' in ids and 'prod-bom2' in ids and 'prod-ruim' not in ids, 'os dois produtos bons foram gravados; só o recusado ficou de fora (%s)' % sorted(i for i in ids if i.startswith('prod-')))
    check('Envio inválido' in alert(pg), 'aviso do registro recusado na tela (%s)' % alert(pg))
    pend = pg.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('srv-pend')).map(k => localStorage.getItem(k))")
    check(not any(p and p != '[]' for p in pend), 'nada ficou preso na fila do aparelho')
    check(not pg.evaluate("() => __T.S().products.some(p => p.id === 'prod-ruim')"), 'o recusado voltou a ficar como está no servidor')
    check(not E, 'administrador sem erro de JavaScript: %s' % E[:2]); b.close()

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

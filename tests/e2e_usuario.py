"""O que o "usuário confuso" da banca encontrou, pela tela (celular 390 px): sem internet, duplo toque,
ponto decimal, usuário repetido, cancelar sem querer, quantidade e recarregar a página.
Uso: BASE=... CREDS=.../creds.json ADMIN_PASSWORD=... python3 tests/e2e_usuario.py  (sai com 1 se falhar)
"""
import json, os, sys, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); CR = json.load(open(os.environ['CREDS']))['final']; ADMIN = os.environ['ADMIN_PASSWORD']
fails = []; ok = 0
def chk(c, m):
    global ok
    print(('  OK    ' if c else '  FALHA ') + m)
    if c: ok += 1
    else: fails.append(m)
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.open(urllib.request.Request(BASE + '/api/login', data=json.dumps({'login': 'eduardo', 'password': ADMIN}).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'}))
def server(): return json.loads(op.open(BASE + '/api/state').read())['S']
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def device(name, phone=True):
        ctx = b.new_context(viewport={'width': 390, 'height': 844} if phone else {'width': 1100, 'height': 760})
        ctx.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e))); return ctx, pg
    def login(pg, hv, f, u, p):
        pg.goto(BASE + '/' + hv); pg.wait_for_timeout(500); pg.fill(f[0], u); pg.fill(f[1], p); pg.click(f[2] + ' button[type=submit]'); pg.wait_for_timeout(1800)

    print('\n== Cliente sem internet')
    ctx, cli = device('cliente'); login(cli, '', ('#lu', '#lp', '#lf'), 'pirilampo', CR['pirilampo'])
    n0 = len([o for o in server()['orders'] if 'PIRILAMPO' in o['customer'].upper()])
    for k in range(3): cli.locator('article.card [data-add]').nth(k).click(); cli.wait_for_timeout(120)
    q = cli.locator('article.card input[data-qty]').first; q.fill('30'); q.press('Tab'); cli.wait_for_timeout(200)
    cli.reload(); cli.wait_for_timeout(2000)
    chk(cli.locator('article.card input[data-qty]').count() > 0 and cli.locator('#openCart').inner_text().strip() not in ('', '0'), 'carrinho continua depois de recarregar a página')
    q = cli.locator('article.card input[data-qty]').first; q.fill(''); q.press('Tab'); cli.wait_for_timeout(300)
    chk(cli.locator('article.card input[data-qty]').first.input_value() not in ('', '0'), 'apagar a quantidade não tira o produto')
    cli.click('#openCart'); cli.wait_for_timeout(300)
    for f in cli.locator('[id$="-num"]').all(): f.fill('100')
    ctx.set_offline(True)
    cli.click('#finish'); cli.wait_for_timeout(500)
    if cli.locator('#ce').count() and cli.locator('#ce').inner_text():
        for f in cli.locator('[id$="-num"]').all(): f.fill('100')
        cli.click('#finish')
    cli.wait_for_timeout(1500)
    t = cli.locator('#app').inner_text()
    chk('ainda não enviado' in t.lower() and 'enviado' not in t.lower().replace('ainda não enviado', ''), f'sem internet o app NÃO diz "enviado" ({t[:60]!r})')
    chk(cli.locator('#srvnet:not([hidden])').count() == 1, 'faixa vermelha "sem internet" aparece')
    ctx.set_offline(False); cli.evaluate("window.dispatchEvent(new Event('online'))"); cli.wait_for_timeout(3000)
    t = cli.locator('#app').inner_text(); n1 = len([o for o in server()['orders'] if 'PIRILAMPO' in o['customer'].upper()])
    no = max(o['no'] for o in server()['orders'])
    chk(n1 == n0 + 1 and f'nº {no}' in t.lower().replace('Nº', 'nº'), f'com a internet de volta: enviado sozinho e o número é o do servidor ({no})')
    chk(cli.locator('#srvnet:not([hidden])').count() == 0, 'faixa vermelha some')

    ctx.close()

    print('\n== Faturamento: duplo toque em "Faturado"')
    S = server()
    a_ctx, adm = device('admin', False); login(adm, '#admin', ('#lu', '#lp', '#lf'), 'eduardo', ADMIN)
    # prepara 2 pedidos separados aguardando faturamento (pela API, como admin)
    c = [x for x in S['customers'] if x.get('login') == 'kesfi'][0]; p = [x for x in S['products'] if x.get('active') is not False and float(x.get('price') or 0) > 0][0]
    q_ = max(10, int(float(S['store'].get('min') or 0) * 2 / float(p['price'])) + 1)
    ids = []
    for k in range(2):
        oid = 'dt%d%s' % (k, os.urandom(3).hex())
        o = {'id': oid, 'customerId': c['id'], 'customer': c['name'], 'items': [{'pid': p['id'], 'name': p['name'], 'q': q_, 'price': float(p['price'])}], 'sub': q_ * float(p['price']), 'total': q_ * float(p['price']), 'mode': 'entrega', 'pay': S['payments'][0], 'status': 'separado', 'date': '2026-10-29T08:0%d:00.000Z' % k, 'nf': None}
        op.open(urllib.request.Request(BASE + '/api/sync', data=json.dumps({'changes': [{'c': 'orders', 'id': oid, 'op': 'put', 'doc': o}]}).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'})); ids.append(oid)
    f_ctx, ft = device('faturamento'); login(ft, '#faturamento', ('#fblu', '#fblp', '#fbl'), 'm', CR['m'])
    first = ft.locator('[data-fnf]').first; fid = first.get_attribute('data-fnf'); first.fill('5001')
    ft.locator(f'[data-fok="{fid}"]').dblclick(); ft.wait_for_timeout(2500)
    S = server(); billed = [o for o in S['orders'] if o['id'] in ids and o.get('billed')]
    chk(len(billed) == 1 and billed[0]['billed']['nf'] == '5001', f'duplo toque fatura só o pedido certo ({[(o["no"], o["billed"]["nf"]) for o in billed]})')
    f_ctx.close()

    print('\n== Vendedor: preço com ponto decimal')
    v_ctx, ven = device('vendedor'); login(ven, '#vendedor', ('#vdlu', '#vdlp', '#vdl'), 'vend', CR['vend'])
    ven.click('#vNew'); ven.wait_for_timeout(300); ven.fill('#lncq', 'pirilampo'); ven.press('#lncq', 'Enter'); ven.wait_for_timeout(400)
    ven.fill('#lnq', 'heineken 473'); ven.wait_for_timeout(300); ven.locator('[data-lqi]').first.click(); ven.wait_for_timeout(200)
    inp = ven.locator('[data-lp]').first; inp.fill('4.5'); inp.press('Enter'); ven.wait_for_timeout(800)
    val = ven.locator('[data-lp]').first.input_value()
    chk(val.replace('.', ',') in ('4,50', '4,5'), f'"4.5" vira 4,50 (não 45,00): campo mostra {val!r}')
    ven.reload(); ven.wait_for_timeout(2000)
    chk(ven.locator('[data-lp]').count() > 0, 'pedido em andamento do vendedor continua depois de recarregar')
    v_ctx.close()

    print('\n== Administrador: usuário repetido e cancelar sem querer')
    adm.locator('.tabs [data-tab]', has_text='Cadastros').first.click(); adm.wait_for_timeout(300)
    adm.click('[data-cadg=usuarios]'); adm.wait_for_timeout(200); adm.locator('[data-cad]', has_text='Conferentes').first.click(); adm.wait_for_timeout(300)
    chk(len(adm.locator('#ckp').input_value()) >= 8, f'senha sugerida no cadastro já vale ({adm.locator("#ckp").input_value()!r})')
    adm.fill('#ckn', 'Duda Mesmo Login'); adm.fill('#ckl', 'vend'); adm.click('#ckadd'); adm.wait_for_timeout(500)
    chk('já é usado' in adm.locator('#ckerr').inner_text(), f'login de outra pessoa: avisa na hora ({adm.locator("#ckerr").inner_text()!r})')
    adm.locator('.tabs [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(300)
    adm.locator('.subnav [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(400)
    btn = adm.locator('.stmini.st-cancelado').first; oid = btn.get_attribute('data-stb'); st0 = [o for o in server()['orders'] if o['id'] == oid][0]['status']
    adm.once('dialog', lambda d: d.dismiss()); btn.click(); adm.wait_for_timeout(1200)
    chk([o for o in server()['orders'] if o['id'] == oid][0]['status'] == st0, 'cancelar pede confirmação (respondendo "não", nada muda)')
    bb = btn.bounding_box(); chk(bb and bb['width'] >= 40 and bb['height'] >= 40, f'botão de situação com 40 px ou mais ({bb and (bb["width"], bb["height"])})')
    a_ctx.close()
    b.close()
chk(not errs, 'sem erro de JavaScript na tela: ' + '; '.join(errs[:3]))
print(f'\nRESULTADO: {ok} ok, {len(fails)} falhas')
for f in fails: print('  -', f)
sys.exit(1 if fails else 0)

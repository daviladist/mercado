"""Fluxo completo com o servidor: cada pessoa no seu aparelho (navegador separado), do pedido ao acerto do motorista.
Uso: BASE=http://localhost:3077 CREDS=.../creds.json OUT=pasta python3 tests/e2e_flow.py
"""
import json, os, base64
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); OUT = os.environ.get('OUT', '/tmp/e2e'); os.makedirs(OUT, exist_ok=True)
CR = json.load(open(os.environ['CREDS']))['final']; ADMIN = os.environ['ADMIN_PASSWORD']
PHOTO = os.environ.get('PHOTO', '/tmp/claude-0/-home-claude/d08596d7-f894-59a2-8e8c-7090e0502b8d/scratchpad/canhoto.jpg')
STUB = """window.jspdf={jsPDF:function(){const d={internal:{pageSize:{getWidth:()=>297,getHeight:()=>210}},lastAutoTable:{finalY:50}};const P=new Proxy(d,{get:(t,k)=>k in t?t[k]:k==='getNumberOfPages'?()=>1:k==='output'?()=>new ArrayBuffer(8):()=>P});return P}};"""
errs = []; log = []
def say(*a): print(*a); log.append(' '.join(str(x) for x in a))
def local_only(route): return route.continue_() if route.request.url.startswith(BASE) else route.abort()
def toast(pg): return (pg.locator('.toast,#toast').all_inner_texts() or [''])[-1]
def wait_sync(pg, ms=400):
    pg.wait_for_timeout(ms)
    for _ in range(60):
        if not pg.locator('#srvbadge:not([hidden])').count(): break
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(200)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def device(name, phone=True):
        ctx = b.new_context(viewport={'width': 390, 'height': 844} if phone else {'width': 1100, 'height': 760}, device_scale_factor=2)
        ctx.route('**/*', local_only); ctx.add_init_script(STUB)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e)))
        pg.on('response', lambda r: errs.append(f'{name}: HTTP {r.status} {r.url}') if r.url.startswith(BASE + '/api/') and r.status >= 400 and not r.url.endswith('/api/me') else None)
        return pg
    def login(pg, hashv, fields, user, pw_):
        pg.goto(BASE + '/' + hashv); pg.wait_for_timeout(500)
        pg.fill(fields[0], user); pg.fill(fields[1], pw_); pg.click(fields[2] + ' button[type=submit]'); pg.wait_for_timeout(1500)
    # ---------- cliente faz o pedido e negocia
    cli = device('cliente'); login(cli, '', ('#lu', '#lp', '#lf'), 'kesfi', CR['kesfi'])
    for k in range(6): cli.locator('article.card [data-add]').first.click(); cli.wait_for_timeout(120)
    q = cli.locator('article.card input[data-qty]').first; q.fill('5'); q.press('Tab'); cli.wait_for_timeout(200)
    cli.click('#openCart'); cli.wait_for_timeout(300)
    cli.locator('[data-neg]').nth(1).click(); cli.wait_for_timeout(200)
    ph = cli.locator('#negv').get_attribute('placeholder'); v = round(float(ph.replace('.', '').replace(',', '.')) * 0.95, 2)
    cli.fill('#negv', str(v).replace('.', ',')); cli.click('[data-negok]'); cli.wait_for_timeout(1200)
    say('cliente negociou:', toast(cli))
    if cli.locator('[data-mode="entrega"]').count(): cli.click('[data-mode="entrega"]'); cli.wait_for_timeout(200)
    cli.click('#finish'); cli.wait_for_timeout(500)
    if cli.locator('#ce').count() and cli.locator('#ce').inner_text():
        say('carrinho pede:', cli.locator('#ce').inner_text())
        for f in cli.locator('[id$="-num"]').all(): f.fill('100')
        cli.click('#finish')
    wait_sync(cli, 800)
    say('cliente:', cli.locator('#app').inner_text()[:80].replace('\n', ' / '))
    cli.screenshot(path=f'{OUT}/f01_cliente_enviado.png')
    # ---------- administrador responde a negociação
    adm = device('admin', False); login(adm, '#admin', ('#lu', '#lp', '#lf'), 'eduardo', ADMIN)
    adm.locator('.tabs [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(300)
    adm.locator('.subnav [data-tab]', has_text='Decisões').first.click(); adm.wait_for_timeout(400)
    adm.locator('[data-anexp]').first.click(); adm.wait_for_timeout(300)
    p = adm.locator('.anit', has_text='CLIENTE PEDIU').locator('[data-anp]').first
    cur = float(p.input_value().replace('.', '').replace(',', '.')); p.fill(str(round(cur * 1.02, 2)).replace('.', ',')); p.press('Enter'); adm.wait_for_timeout(400)
    adm.fill('[data-ancn]', 'Consigo chegar nesse valor.'); adm.locator('[data-anok]').first.click(); wait_sync(adm, 800)
    say('admin respondeu:', toast(adm))
    # ---------- cliente aceita (no aparelho dele: atualiza sozinho ou pelo botão)
    cli.reload(); cli.wait_for_timeout(1500)
    cli.locator('button:has-text("Meus pedidos")').first.click(); cli.wait_for_timeout(500)
    cli.screenshot(path=f'{OUT}/f02_cliente_resposta.png')
    say('cliente vê resposta:', cli.locator('[data-cacc]').count() > 0)
    cli.locator('[data-cacc]').first.click(); wait_sync(cli, 800)
    # ---------- vendedor lança pedido com preço baixo e manda para análise
    ven = device('vendedor'); login(ven, '#vendedor', ('#vdlu', '#vdlp', '#vdl'), 'vend', CR['vend'])
    ven.click('#vNew'); ven.wait_for_timeout(300); ven.fill('#lncq', 'pirilampo'); ven.press('#lncq', 'Enter'); ven.wait_for_timeout(400)
    if ven.locator('[data-lm="entrega"]').count(): ven.click('[data-lm="entrega"]'); ven.wait_for_timeout(200)
    for qq, n in [('heineken 473', 4), ('brahma', 3)]:
        ven.fill('#lnq', qq); ven.wait_for_timeout(300)
        for k in range(n): ven.locator('[data-lqi]').first.click(); ven.wait_for_timeout(100)
    inp = ven.locator('[data-lp]').first; cur = float(inp.input_value().replace('.', '').replace(',', '.')); inp.fill(str(round(cur * 0.72, 2)).replace('.', ',')); inp.press('Enter'); ven.wait_for_timeout(1500)
    lock = ven.locator('.lockbox').first.inner_text().replace('\n', ' ') if ven.locator('.lockbox').count() else 'sem trava'
    say('vendedor trava (servidor):', lock[:90])
    for f in ven.locator('[id$="-num"]').all(): f.fill('200')
    ven.click('#lnSave'); ven.wait_for_timeout(1500)
    ven.screenshot(path=f'{OUT}/f03_vendedor_revisar.png')
    if ven.locator('#rvAsk').count(): ven.click('#rvAsk')
    else: ven.click('#rvSend')
    wait_sync(ven, 1000); say('vendedor enviou:', toast(ven))
    # ---------- administrador aprova
    adm.reload(); adm.wait_for_timeout(1500)
    adm.locator('.tabs [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(300)
    adm.locator('.subnav [data-tab]', has_text='Decisões').first.click(); adm.wait_for_timeout(400)
    if adm.locator('[data-anexp]').count(): adm.locator('[data-anexp]').first.click(); adm.wait_for_timeout(300)
    adm.screenshot(path=f'{OUT}/f04_admin_decisao.png')
    if adm.locator('[data-anok]').count(): adm.locator('[data-anok]').first.click(); wait_sync(adm, 800); say('admin aprovou vendedor:', toast(adm))
    else: say('pedido do vendedor dentro da tolerância: não precisou de análise')
    # ---------- conferente separa os dois (um com falta)
    cf = device('conferente'); login(cf, '#conferente', ('#cflu', '#cflp', '#cfl'), '1', CR['1'])
    cards = cf.locator('.cfcard').all_inner_texts(); say('conferente fila:', [c.split('\n')[0:2] for c in cards][:4])
    for idx, falta in [(0, False), (0, True)]:
        cf.locator('[data-ct=fila]').click() if cf.locator('[data-ct=fila]').count() else None; cf.wait_for_timeout(300)
        target = cf.locator('.cfcard', has_text='PIRILAMPO' if falta else 'nº 1015').first
        target.click(); cf.wait_for_timeout(400)
        if cf.locator('#cfStart').count(): cf.click('#cfStart'); wait_sync(cf, 500)
        if falta:
            cf.locator('[data-cfqty]').first.click(); cf.wait_for_timeout(250); cf.fill('#cfqq', '3'); cf.click('#cfqok'); wait_sync(cf, 600)
        k = 0
        while cf.locator('[data-ck][aria-pressed=false]:not([disabled])').count() and k < 20:
            cf.locator('[data-ck][aria-pressed=false]:not([disabled])').first.click(); cf.wait_for_timeout(150); k += 1
        wait_sync(cf, 500)
        if cf.locator('#cfReady').is_enabled(): cf.click('#cfReady'); wait_sync(cf, 800)
        say('conferente separou', 'PIRILAMPO' if falta else 'KESFI', '->', toast(cf))
    cf.screenshot(path=f'{OUT}/f05_conferente.png')
    # ---------- vendedor recebe o aviso da falta
    ven.reload(); ven.wait_for_timeout(1500); say('vendedor aviso falta:', ven.locator('.vsep').count() > 0)
    # ---------- administrador tenta pular o faturamento
    adm.reload(); adm.wait_for_timeout(1500); adm.locator('.tabs [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(300)
    adm.locator('.subnav [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(300)
    row = adm.locator('.orow', has_text='nº 1015').first
    if row.locator('[data-v=pronto]').count(): row.locator('[data-v=pronto]').click(); adm.wait_for_timeout(500)
    say('admin pula faturamento:', toast(adm))
    # ---------- faturamento
    ft = device('faturamento'); login(ft, '#faturamento', ('#fblu', '#fblp', '#fbl'), 'm', CR['m'])
    n = ft.locator('[data-fnf]').count(); say('faturamento a faturar:', n)
    for i in range(n):
        ft.locator('[data-fnf]').first.fill(str(12345 + i)); ft.locator('[data-fok]').first.click(); wait_sync(ft, 800)
    ft.screenshot(path=f'{OUT}/f06_faturamento.png')
    # ---------- administrador escolhe o motorista
    adm2 = device('admin-celular'); login(adm2, '#admin', ('#lu', '#lp', '#lf'), 'eduardo', ADMIN)
    adm2.locator('.tabs [data-tab]', has_text='Pedidos').first.click(); adm2.wait_for_timeout(300)
    adm2.locator('.subnav [data-tab]', has_text='Pedidos').first.click(); adm2.wait_for_timeout(300)
    for k in range(adm2.locator('[data-drvpick]').count()):
        adm2.locator('[data-drvpick]').nth(k).click(); adm2.wait_for_timeout(250); adm2.fill('#drvq', 'ze'); adm2.wait_for_timeout(200); adm2.press('#drvq', 'Enter'); wait_sync(adm2, 600)
    say('motorista escolhido:', [t[:40] for t in adm2.locator('[data-drvpick]').all_inner_texts()])
    # ---------- entregador
    ent = device('entregador'); login(ent, '#entregador', ('#dvlu', '#dvlp', '#dvl'), 'ze', CR['ze'])
    sel = ent.locator('[data-dsel]:not([disabled])'); say('entregador pode sair com:', sel.count())
    for k in range(sel.count()): sel.nth(k).check(); ent.wait_for_timeout(150)
    ent.click('[data-dgo]'); wait_sync(ent, 1000); say('romaneio:', toast(ent))
    oks = ent.locator('[data-dok]').all(); say('em rota:', len(oks))
    cards = ent.locator('.entc', has_text='KESFI')
    oid = ent.locator('.entc', has_text='1015').locator('[data-dok]').first.get_attribute('data-dok')
    ent.click(f'[data-dok="{oid}"]'); ent.wait_for_timeout(300)
    ent.fill(f'#dnm-{oid}', 'Kesia'); ent.set_input_files(f'[data-dph="{oid}"]', PHOTO); ent.wait_for_timeout(700)
    if ent.locator(f'[data-dpay="{oid}|dinheiro"]').count(): ent.click(f'[data-dpay="{oid}|dinheiro"]'); ent.wait_for_timeout(200)
    ent.click(f'[data-dconf="{oid}"]'); wait_sync(ent, 1200); say('entrega 1:', toast(ent))
    vid = ent.locator('.entc', has_text='PIRILAMPO').locator('[data-docc]').first.get_attribute('data-docc')
    ent.click(f'[data-docc="{vid}"]'); ent.wait_for_timeout(300); ent.click(f'[data-occpick="{vid}|0"]'); ent.wait_for_timeout(250)
    if ent.locator(f'[data-occu="{vid}|un"]').count(): ent.click(f'[data-occu="{vid}|un"]'); ent.wait_for_timeout(200)
    ent.click(f'[data-occadd="{vid}"]'); ent.wait_for_timeout(300)
    ent.fill(f'#dnm-{vid}', 'Paulo'); ent.set_input_files(f'[data-dph="{vid}"]', PHOTO); ent.wait_for_timeout(700)
    if ent.locator(f'[data-dpay="{vid}|pix"]').count(): ent.click(f'[data-dpay="{vid}|pix"]'); ent.wait_for_timeout(200)
    ent.click(f'[data-dconf="{vid}"]'); wait_sync(ent, 1200); say('entrega 2 (ocorrência):', toast(ent))
    ent.reload(); ent.wait_for_timeout(1500); ent.screenshot(path=f'{OUT}/f07_entregador_fim.png')
    say('entregador vê:', ent.locator('#app').inner_text()[:160].replace('\n', ' / '))
    # ---------- administrador: dinheiro do motorista e canhoto
    adm.reload(); adm.wait_for_timeout(1500); adm.locator('.tabs [data-tab]', has_text='Pedidos').first.click(); adm.wait_for_timeout(300)
    adm.locator('.subnav [data-tab]', has_text='Entregas').first.click(); adm.wait_for_timeout(500)
    say('admin dinheiro:', adm.locator('.entsec').first.inner_text()[:120].replace('\n', ' / '))
    if adm.locator('[data-dvph]').count():
        adm.locator('[data-dvph]').first.click(); adm.wait_for_timeout(800)
        src = adm.locator('img.entph').first.get_attribute('src'); nat = adm.locator('img.entph').first.evaluate('i=>i.naturalWidth')
        say('canhoto no admin:', src[:40], 'largura', nat)
    if adm.locator('[data-dset]').count(): adm.locator('[data-dset]').first.click(); wait_sync(adm, 800); say('acerto:', toast(adm))
    adm.screenshot(path=f'{OUT}/f08_admin_entregas.png', full_page=True)
    # ---------- nada guardado nos aparelhos
    for nm, pg in [('cliente', cli), ('vendedor', ven), ('conferente', cf), ('faturamento', ft), ('entregador', ent), ('admin', adm)]:
        ls = pg.evaluate('()=>Object.keys(localStorage).map(k=>k+"="+String(localStorage.getItem(k)).length)')
        html = pg.content()
        say(f'{nm:11} localStorage: {ls} | "cost" na página: {html.count("data-cost=\"1") + html.count("custo R$") if nm != "admin" else "-"}')
    b.close()
json.dump(log, open(f'{OUT}/flow_log.json', 'w'), ensure_ascii=False)
print('ERROS', errs)

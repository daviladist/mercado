"""Entrada de mercadoria pela tela: fornecedor (admin) -> conferente recebe a nota e confere (estoque soma)
-> faturamento precifica e aprova (preço, preço com IE, custo e tributação vão para o produto).
Uso: BASE=... CREDS=... ADMIN_PASSWORD=... python3 tests/e2e_notas.py  (sai com 1 se falhar)
"""
import json, os, sys, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); CR = json.load(open(os.environ['CREDS']))['final']; ADMIN = os.environ['ADMIN_PASSWORD']; OUT = os.environ.get('OUT', '/tmp')
fails = []; ok = 0
def chk(c, m):
    global ok
    print(('  OK    ' if c else '  FALHA ') + m)
    if c: ok += 1
    else: fails.append(m)
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.open(urllib.request.Request(BASE + '/api/login', data=json.dumps({'login': 'eduardo', 'password': ADMIN}).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'}))
def server(): return json.loads(op.open(BASE + '/api/state').read())['S']
S0 = server()
num = lambda v: float(v) if str(v).strip() not in ('', 'None') else 0.0
cands = [p for p in S0['products'] if p.get('active') is not False and p.get('ean') and str(p.get('stock', '')).strip() not in ('', 'None')]
P1 = cands[0]; P2 = [p for p in S0['products'] if p.get('active') is not False and p['id'] != P1['id']][1]
st1 = num(P1['stock']); st2 = num(P2.get('stock'))
# custo anterior bem acima do que vem na nota (40,50): a precificação sugere proteger a margem
J0 = json.loads(op.open(BASE + '/api/state').read())
op.open(urllib.request.Request(BASE + '/api/sync', data=json.dumps({'changes': [{'c': 'products', 'id': P1['id'], 'op': 'put', 'doc': dict(P1, cost=60), 'ver': J0['V']['products'][P1['id']]}]}).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'}))
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def device(name, phone=True):
        ctx = b.new_context(viewport={'width': 390, 'height': 844} if phone else {'width': 1100, 'height': 800})
        ctx.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e))); pg.on('dialog', lambda d: d.accept())
        pg.on('response', lambda r: errs.append(f'{name}: HTTP {r.status} {r.url}') if r.url.startswith(BASE + '/api/') and r.status >= 400 and not r.url.endswith('/api/me') else None)
        return pg
    def login(pg, hv, f, u, p):
        pg.goto(BASE + '/' + hv); pg.wait_for_timeout(500); pg.fill(f[0], u); pg.fill(f[1], p); pg.click(f[2] + ' button[type=submit]'); pg.wait_for_timeout(1800)
    def wait_sync(pg):
        pg.wait_for_timeout(400)
        for _ in range(60):
            if not pg.locator('#srvbadge:not([hidden])').count(): break
            pg.wait_for_timeout(200)
        pg.wait_for_timeout(300)

    print('\n== Administrador cadastra o fornecedor')
    adm = device('admin', False); login(adm, '#admin', ('#lu', '#lp', '#lf'), 'eduardo', ADMIN)
    adm.click('.tabs [data-tab="cadastros"]'); adm.wait_for_timeout(300); adm.click('[data-cadg="fornecedores"]'); adm.wait_for_timeout(300)
    adm.click('#supNew'); adm.fill('#supc', '10'); adm.fill('#supn', 'Distribuidora Teste Ltda'); adm.fill('#supd', '00.000.000/0001-91'); adm.click('#supf button[type=submit]'); wait_sync(adm)
    chk(any(x['name'] == 'Distribuidora Teste Ltda' and x['code'] == '10' for x in server().get('suppliers', [])), 'fornecedor gravado no servidor')

    print('\n== Conferente recebe a mercadoria')
    cf = device('conferente'); login(cf, '#conferente', ('#cflu', '#cflp', '#cfl'), '1', CR['1'])
    cf.click('[data-ct="rec"]'); cf.wait_for_timeout(400); cf.click('#rcNew'); cf.wait_for_timeout(300)
    cf.fill('#rcsq', 'distrib'); cf.wait_for_timeout(300); cf.locator('[data-rcs]').first.click(); cf.wait_for_timeout(200)
    cf.fill('#rcnfn', '9001'); cf.click('#rcnf button[type=submit]'); wait_sync(cf)
    cf.fill('#rcin', P1['ean']); cf.press('#rcin', 'Enter'); cf.wait_for_timeout(400)
    q = cf.locator('[data-rq]').first; q.fill('5'); q.press('Enter'); cf.wait_for_timeout(150)
    v = cf.locator('[data-rv]').first; v.fill('40,50'); v.press('Enter'); wait_sync(cf)
    cf.fill('#rcin', P2['name'].split()[0].lower() + ' ' + P2['name'].split()[1].lower()); cf.wait_for_timeout(500)
    cf.locator(f'[data-rcp="{P2["id"]}"]').click(); cf.wait_for_timeout(300)
    q = cf.locator('[data-rq]').nth(1); q.fill('2'); q.press('Enter'); v = cf.locator('[data-rv]').nth(1); v.fill('10'); v.press('Enter'); wait_sync(cf)
    cf.screenshot(path=f'{OUT}/notas_conf.png', full_page=True)
    cf.click('#rcOk'); wait_sync(cf)
    S1 = server(); R = [r for r in S1.get('receipts', []) if r['nf'] == '9001']
    chk(R and R[0]['status'] == 'conferida' and len(R[0]['items']) == 2 and abs(R[0]['totalNota'] - (5 * 40.5 + 20)) < 0.01, f"nota conferida com 2 itens e total certo ({R and (R[0]['status'], R[0]['totalNota'])})")
    p1 = [p for p in S1['products'] if p['id'] == P1['id']][0]; p2 = [p for p in S1['products'] if p['id'] == P2['id']][0]
    chk(abs(num(p1['stock']) - (st1 + 5)) < 1e-6 and abs(num(p2['stock']) - (st2 + 2)) < 1e-6, f"estoque somou na conferência ({st1}+5={p1['stock']}, {st2}+2={p2['stock']})")
    adm.reload(); adm.wait_for_timeout(1800)
    chk(adm.locator('.rcalert').count() == 1 and '1 nota' in adm.locator('.rcalert').inner_text(), 'aviso fixo no painel do administrador')
    adm.locator('.rcalert button').click(); adm.wait_for_timeout(500)
    chk('NF 9001' in adm.locator('#tabc').inner_text(), 'botão do aviso abre a Precificação de notas')

    print('\n== Faturamento precifica e aprova')
    ft = device('faturamento'); login(ft, '#faturamento', ('#fblu', '#fblp', '#fbl'), 'm', CR['m'])
    chk('Precificar notas (1)' in ft.locator('#app').inner_text(), 'faturamento vê "Precificar notas (1)"')
    ft.click('[data-ft="prec"]'); ft.wait_for_timeout(400); ft.locator('[data-pco]').first.click(); ft.wait_for_timeout(400)
    k1 = ft.locator('.pcline').first.get_attribute('data-k')
    chk(ft.locator(f'[data-pref="{k1}"]').count() == 1, 'sugere proteger a margem (comprou bem abaixo do custo anterior)')
    ft.locator(f'[data-pref="{k1}"]').click(); wait_sync(ft)
    chk('Margem protegida' in ft.locator('.pcline').first.inner_text(), 'linha mostra a margem protegida')
    ft.locator(f'[data-ptr="{k1}"]').check(); wait_sync(ft); ft.locator(f'[data-pie="{k1}"]').check(); wait_sync(ft)
    pp = ft.locator(f'[data-pp="{k1}"]'); pp.fill('55,90'); pp.press('Tab'); wait_sync(ft)
    pi = ft.locator(f'[data-pi="{k1}"]'); pi.fill('52,50'); pi.press('Tab'); wait_sync(ft)
    mg = ft.locator(f'[data-pmg="{k1}"]').inner_text(); chk('margem' in mg and '%' in mg and 'markup' in mg, f'margem/markup aparecem na linha ({mg})')
    k2 = ft.locator('.pcline').nth(1).get_attribute('data-k')
    p2v = ft.locator(f'[data-pp="{k2}"]');
    if not p2v.input_value(): p2v.fill('15'); p2v.press('Tab'); wait_sync(ft)
    ft.screenshot(path=f'{OUT}/notas_prec.png', full_page=True)
    ft.click('#pcOk'); wait_sync(ft)
    S2 = server(); R = [r for r in S2['receipts'] if r['nf'] == '9001'][0]; p1 = [p for p in S2['products'] if p['id'] == P1['id']][0]
    chk(R['status'] == 'aprovada' and R.get('aprovadaBy'), f"nota aprovada ({R['status']})")
    chk(p1['price'] == 55.9 and p1['iePrice'] == 52.5 and p1['cost'] == 40.5 and p1['trib'] is True, f"produto atualizado: preço {p1['price']}, IE {p1['iePrice']}, custo {p1['cost']}, tributado {p1['trib']}")
    chk(abs(num(p1['stock']) - (st1 + 5)) < 1e-6, 'estoque não soma de novo na aprovação')
    chk(p1.get('refCost') == 60 and not p1.get('refGone'), f"custo de referência foi para o produto ({p1.get('refCost')})")
    # nova nota com custo igual ou maior apaga a referência e avisa a loja
    J = json.loads(op.open(BASE + '/api/state').read())
    op.open(urllib.request.Request(BASE + '/api/sync', data=json.dumps({'changes': [{'c': 'products', 'id': P1['id'], 'op': 'put', 'doc': dict(p1, cost=61), 'ver': J['V']['products'][P1['id']]}]}).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'}))
    p1b = [p for p in server()['products'] if p['id'] == P1['id']][0]
    chk(not p1b.get('refCost') and p1b.get('refGone', {}).get('v') == 60, f"custo maior apaga a referência e deixa aviso ({p1b.get('refGone')})")
    adm.reload(); adm.wait_for_timeout(1800)
    chk('Custo de referência apagado' in adm.locator('#tabc').inner_text(), 'aviso aparece no painel')
    ft.reload(); ft.wait_for_timeout(1800); chk('Precificar notas (' not in ft.locator('#app').inner_text(), 'aviso some depois de aprovada')
    b.close()
chk(not errs, 'sem erro de tela nem da API: ' + '; '.join(errs[:4]))
print(f'\nRESULTADO: {ok} ok, {len(fails)} falhas')
sys.exit(1 if fails else 0)

"""StarIA pelo site: o administrador pede a importação; o "Claude" (aqui simulado pela API, como administrador)
devolve os resultados; a revisão abre sozinha no site. Uso: BASE=... ADMIN_PASSWORD=... python3 tests/e2e_staria.py"""
import json, os, sys, time, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); ADMIN = os.environ['ADMIN_PASSWORD']
fails = []
def chk(c, m): print(('  OK    ' if c else '  FALHA ') + m); (None if c else fails.append(m))
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def post(path, body): return json.loads(op.open(urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'})).read())
post('/api/login', {'login': 'eduardo', 'password': ADMIN})
def state(): return json.loads(op.open(BASE + '/api/state').read())
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '/#admin'); pg.wait_for_timeout(500); pg.fill('#lu', 'eduardo'); pg.fill('#lp', ADMIN); pg.click('#lf button[type=submit]'); pg.wait_for_timeout(1800)
    pg.click('.tabs [data-tab="produtos"]'); pg.wait_for_timeout(400)
    pg.evaluate("()=>document.getElementById('bulkP').click()"); pg.wait_for_timeout(500)
    pg.evaluate("()=>{const b=document.getElementById('bst');b&&b.click()}"); pg.wait_for_timeout(500)
    pg.fill('#sbText', '99001\n99002'); pg.click('#sbGo'); pg.wait_for_timeout(1500)
    chk('Pedido enviado ao Claude' in pg.locator('#tabc').inner_text(), 'site mostra "pedido enviado ao Claude"')
    J = state(); jobs = [j for j in J['S'].get('stariaJobs', []) if j['status'] == 'pendente']
    chk(jobs and set(jobs[0]['terms']) == {'99001', '99002'}, f'pedido gravado no servidor ({jobs and jobs[0]["terms"]})')
    # "Claude" responde
    j = jobs[0]; res = {'99001': {'code': '99001', 'ean': '7890000990013', 'name': 'PRODUTO TESTE STARIA', 'cost': 4.25, 'src': 'custo do fornecedor na última compra (teste)', 'many': False}, '99002': None}
    doc = dict(j, status='pronta', results=res, doneAt=time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()), doneBy='Claude')
    r = post('/api/sync', {'changes': [{'c': 'stariaJobs', 'id': j['id'], 'op': 'put', 'doc': doc, 'ver': J['V']['stariaJobs'][j['id']]}]})
    chk(not r.get('rejected'), 'resultado do Claude gravado')
    for _ in range(40):
        pg.wait_for_timeout(1000)
        if 'PRODUTO TESTE STARIA' in pg.locator('#tabc').inner_text(): break
    chk('PRODUTO TESTE STARIA' in pg.locator('#tabc').inner_text(), 'revisão abriu sozinha com o produto devolvido')
    b.close()
chk(not errs, 'sem erro de tela: ' + '; '.join(errs[:3]))
sys.exit(1 if fails else 0)

"""StarIA pelo site + importação em massa pendente + alteração em massa.
O administrador pede a importação; ela vira um item pendente em Precificação de notas; o "Claude" (aqui simulado
pela API, como administrador) devolve os resultados; a lista enche sozinha. Depois: alteração em massa (categoria,
família, margem), sair da tela e voltar sem perder nada, aprovar e conferir os produtos; e alteração em massa na
lista de produtos. Uso: BASE=... ADMIN_PASSWORD=... OUT=... python3 tests/e2e_staria.py  (sai com 1 se falhar)"""
import json, os, sys, time, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); ADMIN = os.environ['ADMIN_PASSWORD']; OUT = os.environ.get('OUT', '/tmp')
fails = []
def chk(c, m): print(('  OK    ' if c else '  FALHA ') + m); (None if c else fails.append(m))
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def post(path, body): return json.loads(op.open(urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'X-App': '1'})).read())
post('/api/login', {'login': 'eduardo', 'password': ADMIN})
def state(): return json.loads(op.open(BASE + '/api/state').read())
def imports(): return [x for x in state()['S'].get('imports', []) if x['status'] in ('pendente', 'consultando')]
RES = {
    '99001': {'code': '99001', 'ean': '7890000990013', 'name': 'WHEY TESTE 900G CHOCOLATE', 'cost': 100.0, 'src': 'teste', 'many': False},
    '99002': {'code': '99002', 'ean': '7890000990020', 'name': 'WHEY TESTE 900G MORANGO', 'cost': 101.1, 'src': 'teste', 'many': False},
    '99003': {'code': '99003', 'ean': '7890000990037', 'name': 'BARRA TESTE COOKIES', 'cost': 5.74, 'src': 'teste', 'many': False},
    '99004': None,
}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for vp in ({'width': 1280, 'height': 900}, {'width': 390, 'height': 844}):
        mob = vp['width'] < 500; tag = 'celular' if mob else 'computador'
        print(f'\n== {tag}')
        pg = b.new_page(viewport=vp); pg.on('dialog', lambda d: d.accept())
        pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '/#admin'); pg.wait_for_timeout(500); pg.fill('#lu', 'eduardo'); pg.fill('#lp', ADMIN); pg.click('#lf button[type=submit]'); pg.wait_for_timeout(1800)
        if mob:
            # no celular: só abre a importação que o computador deixou pendente e confere o layout
            pg.locator('.rcalert [data-ima]').first.click(); pg.wait_for_timeout(800)
            lines = pg.locator('.imline'); chk(lines.count() >= 1, f'celular: importação abre pelo aviso ({lines.count()} linhas)')
            ov = pg.evaluate("""()=>{const L=[...document.querySelectorAll('.imline')].slice(0,3);let bad=[];L.forEach(l=>{const r=l.getBoundingClientRect();
              [...l.querySelectorAll('input,label,span.imnoie')].forEach(x=>{const q=x.getBoundingClientRect();if(q.width>0&&(q.right>r.right+1||q.left<r.left-1))bad.push(x.outerHTML.slice(0,60))})});
              return {bad, sw:document.documentElement.scrollWidth, w:innerWidth}}""")
            chk(not ov['bad'] and ov['sw'] <= ov['w'] + 1, f'celular: nada sai da linha nem rola para o lado ({ov["bad"][:2]}, {ov["sw"]}/{ov["w"]})')
            pg.screenshot(path=f'{OUT}/import_cel.png', full_page=True)
            chk(not errs, 'celular: sem erro de tela: ' + '; '.join(errs[:3]))
            pg.close(); continue

        pg.click('.tabs [data-tab="produtos"]'); pg.wait_for_timeout(400)
        pg.evaluate("()=>document.getElementById('bulkP').click()"); pg.wait_for_timeout(500)
        pg.evaluate("()=>{const b=document.getElementById('bst');b&&b.click()}"); pg.wait_for_timeout(500)
        pg.fill('#sbText', '99001\n99002\n99003\n99004'); pg.click('#sbGo'); pg.wait_for_timeout(1500)
        chk('Aguardando o Claude consultar o StarIA' in pg.locator('#tabc').inner_text(), 'importação vai direto para Precificação, aguardando o Claude')
        IM = imports(); chk(len(IM) == 1 and IM[0]['status'] == 'consultando' and len(IM[0]['terms']) == 4, f'importação gravada no servidor como pendente ({[(x["status"], len(x["terms"])) for x in IM]})')
        # sai da tela antes de o Claude responder: nada se perde
        pg.click('.tabs [data-tab="pedidos"]'); pg.wait_for_timeout(500)
        chk(pg.locator('.rcalert [data-ima]').count() == 1, 'aviso fixo com o link da importação aparece em outra tela')
        J = state(); jobs = [j for j in J['S'].get('stariaJobs', []) if j['status'] == 'pendente']
        chk(jobs and set(jobs[0]['terms']) == set(RES), f'pedido ao Claude gravado ({jobs and jobs[0]["terms"]})')
        j = jobs[0]; doc = dict(j, status='pronta', results=RES, doneAt=time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()), doneBy='Claude')
        r = post('/api/sync', {'changes': [{'c': 'stariaJobs', 'id': j['id'], 'op': 'put', 'doc': doc, 'ver': J['V']['stariaJobs'][j['id']]}]})
        chk(not r.get('rejected'), 'resultado do Claude gravado')
        pg.locator('.rcalert [data-ima]').first.click(); pg.wait_for_timeout(500)
        for _ in range(40):
            pg.wait_for_timeout(1000)
            if pg.locator('.imline').count() == 3: break
        chk(pg.locator('.imline').count() == 3, f'lista enche sozinha com os 3 encontrados ({pg.locator(".imline").count()})')
        chk('1 código sem resultado' in pg.locator('#tabc').inner_text(), 'código não encontrado aparece separado')
        # alteração em massa: marca todos, categoria + subcategoria + margem 30
        pg.check('#imAll'); pg.fill('#bscat', 'Suplementos'); pg.fill('#bssub', 'Proteínas'); pg.fill('#bsmg', '30'); pg.click('#bsgo'); pg.wait_for_timeout(600)
        p1 = pg.locator('[data-ip]').first.input_value()
        chk(p1.replace('.', ',') == '142,86', f'margem 30% sem tributo: custo 100 vira preço 142,86 ({p1})')
        # só os dois whey: família + tributado + margem com IE
        pg.locator('[data-isel]').nth(2).uncheck(); pg.fill('#bscat', ''); pg.fill('#bssub', ''); pg.fill('#bsmg', '')
        pg.fill('#bsfam', 'WHEY TESTE 900G'); pg.select_option('#bstr', '1'); pg.fill('#bsmg', '25'); pg.fill('#bsmi', '20'); pg.click('#bsgo'); pg.wait_for_timeout(600)
        chk(pg.locator('[data-iq]').count() == 2, f'tributados mostram preço com IE ({pg.locator("[data-iq]").count()})')
        mg = pg.locator('[data-im]').first.input_value(); chk(mg.replace('.', ',') in ('25', '25,0'), f'margem sem IE do tributado confere com o pedido ({mg})')
        # digita o preço da barra direto na linha e sai da tela no meio
        k3 = pg.locator('.imline').nth(2).get_attribute('data-k')
        pg.fill(f'[data-ip="{k3}"]', '8,99'); pg.wait_for_timeout(200)
        pg.click('.tabs [data-tab="hoje"]'); pg.wait_for_timeout(2500)
        it = {i['code']: i for i in imports()[0]['items']}
        chk(it['99003']['price'] == 8.99 and it['99001']['cat'] == 'Suplementos' and it['99001']['fam'] == 'WHEY TESTE 900G' and it['99002']['var'] == 'MORANGO' and it['99001']['trib'] is True, f"tudo salvo no servidor ao sair da tela ({it['99003']['price']}, {it['99001']['cat']}, {it['99002'].get('var')})")
        pg.reload(); pg.wait_for_timeout(2000)
        chk(pg.locator('.rcalert [data-ima]').count() == 1, 'depois de recarregar, o link da importação continua')
        pg.locator('.rcalert [data-ima]').first.click(); pg.wait_for_timeout(800)
        chk(pg.locator(f'[data-ip="{k3}"]').input_value().replace('.', ',') == '8,99', 'preço digitado continua lá ao voltar')
        pg.screenshot(path=f'{OUT}/import_pc.png', full_page=True)
        pg.click('#imOk'); pg.wait_for_timeout(2000)
        S = state()['S']; P = {p.get('code'): p for p in S['products']}
        w = P.get('99002')
        chk(w and w['cat'] == 'Suplementos' and w['sub'] == 'Proteínas' and w['fam'] == 'WHEY TESTE 900G' and w['var'] == 'MORANGO' and w['trib'] is True and w['price'] > 0 and w['iePrice'] > 0 and w['iePrice'] < w['price'] and abs(w['cost'] - 101.1) < 0.01,
            f'produto novo criado com tudo ({w and (w["cat"], w["sub"], w["fam"], w["var"], w["price"], w["iePrice"], w["cost"])})')
        chk(P.get('99003') and P['99003']['price'] == 8.99 and P['99003']['trib'] is False and not P['99003'].get('iePrice'), 'não tributado: só preço sem IE')
        chk(not imports(), 'importação some das pendentes depois de aprovar tudo')
        # lista de produtos: alteração em massa de estrutura
        pg.click('.tabs [data-tab="produtos"]'); pg.wait_for_timeout(400)
        pg.evaluate("()=>document.getElementById('pbP').click()"); pg.wait_for_timeout(400)
        pg.fill('#aq', 'whey teste'); pg.wait_for_timeout(400)
        dmsg = []; pg.on('dialog', lambda d: dmsg.append(d.message))
        pg.check('#pbAll'); pg.fill('#bssub', 'Whey'); pg.select_option('#bsact', '0'); pg.click('#bsgo'); pg.wait_for_timeout(1500)
        print('   diálogo:', dmsg, '| aviso:', pg.locator('#toast').inner_text() if pg.locator('#toast').count() else '')
        for _ in range(20):
            P = {p.get('code'): p for p in state()['S']['products']}
            if P['99001']['sub'] == 'Whey': break
            pg.wait_for_timeout(500)
        chk(P['99001']['sub'] == 'Whey' and P['99002']['sub'] == 'Whey' and P['99001']['active'] is False and P['99003']['sub'] == 'Proteínas' and P['99003']['active'] is True, f"alteração em massa na lista de produtos ({P['99001']['sub']}, {P['99001']['active']}, {P['99003']['sub']!r})")
        chk(not errs, 'sem erro de tela: ' + '; '.join(errs[:3]))
        # deixa uma importação pendente para o teste do celular
        post('/api/sync', {'changes': [{'c': 'imports', 'id': 'imtestecel', 'op': 'put', 'doc': {'id': 'imtestecel', 'kind': 'staria', 'status': 'pendente', 'terms': ['99001', '99003'], 'items': [
            {'k': 'ma', 'term': '99001', 'code': '99001', 'ean': '', 'name': 'WHEY TESTE 900G CHOCOLATE COM NOME BEM COMPRIDO PARA TESTAR', 'ucost': 100, 'pid': '', 'cat': 'Suplementos', 'sub': '', 'fam': '', 'var': '', 'unit': 'Unidade', 'perPack': '', 'trib': True, 'price': 140, 'iePrice': 130, 'active': True, 'done': False},
            {'k': 'mb', 'term': '99003', 'code': '99003', 'ean': '', 'name': 'BARRA', 'ucost': 5.74, 'pid': '', 'cat': '', 'sub': '', 'fam': '', 'var': '', 'unit': 'Unidade', 'perPack': '', 'trib': False, 'price': '', 'iePrice': '', 'active': True, 'done': False}],
            'miss': [], 'at': '2026-10-29T12:00:00.000Z', 'by': 'teste'}}]})
        pg.close()
    # cancela a importação de teste (as outras suítes contam os avisos)
    J = state(); d = [x for x in J['S']['imports'] if x['id'] == 'imtestecel'][0]
    post('/api/sync', {'changes': [{'c': 'imports', 'id': d['id'], 'op': 'put', 'doc': dict(d, status='cancelada'), 'ver': J['V']['imports'][d['id']]}]})
    b.close()
print(f'\nRESULTADO: {len(fails)} falhas')
sys.exit(1 if fails else 0)

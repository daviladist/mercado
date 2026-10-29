"""Prepara os acessos como o administrador faria pela tela, gera senhas provisórias e cada pessoa cria a própria senha."""
import json, os, secrets, sys
# senhas de teste sorteadas a cada execução (nada de senha escrita no repositório)
def gen():
    while True:
        p = 'Tt' + secrets.token_urlsafe(9).replace('-', 'x').replace('_', 'y') + 'a7'
        if not any(l in p.lower() for l in ('1', 'm', 'ze', 'vend', 'kesfi', 'pirilampo')): return p
P_VEND, P_ZE = gen(), gen()
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077')
OUT = os.environ.get('OUT', '/tmp/e2e'); os.makedirs(OUT, exist_ok=True)
ADMIN = ('eduardo', os.environ['ADMIN_PASSWORD'])
errs = []
def local_only(route):
    u = route.request.url
    return route.continue_() if u.startswith(BASE) else route.abort()
def new_ctx(b, phone=False):
    ctx = b.new_context(viewport={'width': 390, 'height': 844} if phone else {'width': 1100, 'height': 760}, device_scale_factor=2)
    ctx.route('**/*', local_only); return ctx
def toast(pg): return (pg.locator('.toast,#toast').all_inner_texts() or [''])[-1]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = new_ctx(b); pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append('admin: ' + str(e)))
    pg.goto(BASE + '/#admin'); pg.wait_for_timeout(600)
    pg.fill('#lu', ADMIN[0]); pg.fill('#lp', ADMIN[1]); pg.click('#lf button[type=submit]'); pg.wait_for_timeout(1200)
    assert pg.locator('#tabc h2').first.inner_text().upper() == 'DASHBOARD'
    pg.locator('.tabs [data-tab]', has_text='Cadastros').first.click(); pg.wait_for_timeout(300)
    # vendedor: usuário + senha provisória definida pelo administrador
    pg.click('[data-cadg=usuarios]'); pg.wait_for_timeout(200)
    pg.locator('[data-cad]', has_text='Vendedores').first.click(); pg.wait_for_timeout(200)
    pg.locator('[data-sle]').first.click(); pg.wait_for_timeout(200)
    pg.fill('#sll', 'vend'); pg.fill('#slpw', P_VEND); pg.fill('#slmg', '15'); pg.check('#slall')
    pg.click('#slf button[type=submit]'); pg.wait_for_timeout(900)
    print('vendedor:', pg.locator('#cadc .prow').first.inner_text().replace('\n', ' | ')[:160])
    # motorista com acesso
    pg.locator('[data-cad]', has_text='Motoristas').first.click(); pg.wait_for_timeout(200)
    pg.fill('#vdrv', 'Zé Motorista'); pg.fill('#vcar', 'Caminhão'); pg.fill('#vlog', 'ze'); pg.fill('#vpas', P_ZE); pg.click('#vadd'); pg.wait_for_timeout(900)
    print('motoristas:', [x.replace('\n', ' | ')[:120] for x in pg.locator('#cadc .prow').all_inner_texts()])
    # cliente KESFI pode negociar
    pg.click('[data-cadg=clientes]'); pg.wait_for_timeout(300)
    pg.locator('.prow', has_text='KESFI').locator('[data-ce]').first.click(); pg.wait_for_timeout(300)
    pg.check('#cneg'); pg.click('#cf button[type=submit]'); pg.wait_for_timeout(900)
    print('toast cliente:', toast(pg))
    # senhas provisórias para quem está sem senha
    pg.click('[data-cadg=config]'); pg.wait_for_timeout(300)
    pg.locator('[data-cad]', has_text='Loja').first.click(); pg.wait_for_timeout(300)
    pg.click('#tmpPw'); pg.wait_for_selector('#tmpPwBox tbody tr, #tmpPwBox .err, #tmpPwBox .muted', timeout=60000); pg.wait_for_timeout(300)
    rows = [r.split('\t') for r in pg.locator('#tmpPwBox tbody tr').all_inner_texts()]
    temp = {r[2]: r[3] for r in rows}
    temp['vend'] = P_VEND; temp['ze'] = P_ZE
    print('senhas provisórias geradas:', len(rows), [r[:3] for r in rows])
    pg.screenshot(path=f'{OUT}/s02_senhas.png', full_page=True)
    # cada pessoa entra com a provisória e cria a sua
    final = {}
    for role, view, login, newp in [('cliente', '', 'kesfi', gen()), ('cliente', '', 'pirilampo', gen()), ('conferente', 'conferente', '1', gen()),
                                    ('faturamento', 'faturamento', 'm', gen()), ('vendedor', 'vendedor', 'vend', gen()), ('entregador', 'entregador', 'ze', gen())]:
        c2 = new_ctx(b, True); p2 = c2.new_page(); p2.on('pageerror', lambda e, r=role: errs.append(r + ': ' + str(e)))
        p2.goto(BASE + '/' + ('#' + view if view else '')); p2.wait_for_timeout(500)
        ids = {'cliente': ('#lu', '#lp', '#lf'), 'conferente': ('#cflu', '#cflp', '#cfl'), 'faturamento': ('#fblu', '#fblp', '#fbl'), 'vendedor': ('#vdlu', '#vdlp', '#vdl'), 'entregador': ('#dvlu', '#dvlp', '#dvl')}[role]
        p2.fill(ids[0], login); p2.fill(ids[1], temp[login]); p2.click(ids[2] + ' button[type=submit]'); p2.wait_for_timeout(1200)
        has_reset = p2.locator('#rsf').count() > 0
        p2.fill('#rsn', '1234'); p2.fill('#rsn2', '1234'); p2.click('#rsf button[type=submit]'); [p2.wait_for_timeout(250) for _ in range(40) if not p2.locator('#rse').inner_text()]
        weak = p2.locator('#rse').inner_text()
        p2.fill('#rsn', newp); p2.fill('#rsn2', newp); p2.click('#rsf button[type=submit]')
        try: p2.wait_for_selector('#rsf', state='detached', timeout=15000)
        except Exception: print('   ficou na tela de senha:', p2.locator('#rse').inner_text()); errs.append(login + ': não conseguiu criar a senha')
        p2.wait_for_timeout(800)
        print(f'{role:11} {login:10} tela de nova senha: {has_reset} | senha fraca -> "{weak}" | depois:', p2.locator('#app').inner_text()[:60].replace('\n', ' / '))
        p2.screenshot(path=f'{OUT}/s03_{role}_{login}.png')
        final[login] = newp; c2.close()
    json.dump({'final': final}, open(f'{OUT}/creds.json', 'w'))
    b.close()
print('ERROS', errs)
if errs or len(final) != 6: sys.exit(1)

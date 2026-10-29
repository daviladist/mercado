"""Senha base -> 1º acesso -> senha própria; entrar por qualquer tela; Redefinir senha."""
import os, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); ADMIN = os.environ['ADMIN_PASSWORD']; OUT = os.environ.get('OUT', '/tmp/e2e'); os.makedirs(OUT, exist_ok=True)
errs = []
def local_only(r): return r.continue_() if r.request.url.startswith(BASE) else r.abort()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(phone=False):
        c = b.new_context(viewport={'width': 390, 'height': 844} if phone else {'width': 1100, 'height': 760}); c.route('**/*', local_only)
        p = c.new_page(); p.on('pageerror', lambda e: errs.append(str(e))); return p
    def login_root(p, u, pw_):
        p.goto(BASE + '/'); p.wait_for_timeout(600); p.fill('#lu', u); p.fill('#lp', pw_); p.click('#lf button[type=submit]'); p.wait_for_timeout(1500)
    adm = page(); login_root(adm, 'eduardo', ADMIN); print('admin entrou pela tela única:', adm.locator('#tabc h2').first.inner_text())
    adm.locator('.tabs [data-tab]', has_text='Cadastros').first.click(); adm.wait_for_timeout(300)
    adm.click('[data-cadg=usuarios]'); adm.wait_for_timeout(200); adm.locator('[data-cad]', has_text='Conferentes').first.click(); adm.wait_for_timeout(300)
    adm.fill('#ckn', 'Maria Conferente'); adm.fill('#ckl', 'maria'); adm.fill('#ckp', 'base-1234'); adm.click('#ckadd'); adm.wait_for_timeout(300); print('logo depois de salvar:', adm.locator('#cadc .prow').last.inner_text().replace('\n',' | ')); adm.wait_for_timeout(3000)
    print('lista:', [x.replace('\n', ' | ') for x in adm.locator('#cadc .prow').all_inner_texts()][-1])
    adm.screenshot(path=f'{OUT}/p1_lista.png')
    # admin sai e a colaboradora entra pela MESMA tela
    adm.locator('#admOut').click(); adm.wait_for_timeout(1500)
    print('depois de sair, a tela é:', adm.locator('#app h2').first.inner_text(), '| endereço:', adm.url)
    login_root(adm, 'maria', 'base-1234'); print('maria com senha base -> tela de criar senha:', adm.locator('#rsf').count() == 1)
    adm.fill('#rsn', 'Conf-propria-2026'); adm.fill('#rsn2', 'Conf-propria-2026'); adm.click('#rsf button[type=submit]'); adm.wait_for_timeout(1500)
    print('erro?', adm.locator('#rse').inner_text() if adm.locator('#rse').count() else '-'); print('maria entrou em:', adm.locator('#app').inner_text()[:40].replace('\n', ' / '))
    adm.locator('#cfOut').click(); adm.wait_for_timeout(1500)
    login_root(adm, 'maria', 'base-1234'); print('senha base depois de trocada:', adm.locator('#le').inner_text())
    # administrador redefine
    login_root(adm, 'eduardo', ADMIN)
    adm.locator('.tabs [data-tab]', has_text='Cadastros').first.click(); adm.wait_for_timeout(300)
    adm.click('[data-cadg=usuarios]'); adm.wait_for_timeout(200); adm.locator('[data-cad]', has_text='Conferentes').first.click(); adm.wait_for_timeout(300)
    print('lista após troca:', [x.replace('\n', ' | ') for x in adm.locator('#cadc .prow').all_inner_texts()][-1])
    adm.locator('.prow', has_text='Maria Conferente').locator('[data-pwreset]').click(); adm.wait_for_timeout(300)
    adm.fill('.pwin', 'curta'); adm.click('.pwok'); adm.wait_for_timeout(500); print('senha curta:', adm.locator('.pwerr').inner_text())
    adm.fill('.pwin', 'nova-base-77'); adm.click('.pwok'); adm.wait_for_timeout(2000)
    print('redefinir:', adm.locator('.pwbox').inner_text().replace('\n', ' ')[:170]); adm.screenshot(path=f'{OUT}/p2_redefinir.png')
    m = page(True); login_root(m, 'maria', 'Conf-propria-2026'); print('senha própria antiga depois de redefinir:', m.locator('#le').inner_text())
    login_root(m, 'maria', 'nova-base-77'); print('nova senha base -> criar senha:', m.locator('#rsf').count() == 1)
    m.fill('#rsn', 'Conf-outra-2026'); m.fill('#rsn2', 'Conf-outra-2026'); m.click('#rsf button[type=submit]'); m.wait_for_timeout(1500)
    print('maria de novo em:', m.locator('#app').inner_text()[:30].replace('\n', ' / ')); m.screenshot(path=f'{OUT}/p3_maria.png')
    # cliente pelo CNPJ e vendedor pela tela única
    c2 = page(True); login_root(c2, 'kesfi', 'x-errada-x'); print('cliente senha errada:', c2.locator('#le').inner_text())
    b.close()
print('ERROS', errs)
import sys; sys.exit(1 if errs else 0)

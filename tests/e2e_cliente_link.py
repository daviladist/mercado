"""/cliente: só a entrada do cliente, sem textos da equipe; equipe não entra por ali."""
import os, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); CR = json.load(open(os.environ['CREDS']))['final']; ADMIN = os.environ['ADMIN_PASSWORD']
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page():
        c = b.new_context(viewport={'width': 390, 'height': 844}); c.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        p = c.new_page(); p.on('pageerror', lambda e: errs.append(str(e))); return p
    p = page(); p.goto(BASE + '/cliente'); p.wait_for_timeout(700)
    t = p.locator('#app').inner_text(); print('texto da tela /cliente:', t.replace('\n', ' / ')[:200])
    print('fala de equipe/administrador?', any(w in t.lower() for w in ['equipe', 'administrador', 'vendedor', 'conferente']))
    for u, pw_ in [('eduardo', ADMIN), ('1', CR['1']), ('vend', CR['vend'])]:
        p.fill('#lu', u); p.fill('#lp', pw_); p.click('#lf button[type=submit]'); p.wait_for_timeout(1200); print(f'equipe "{u}" em /cliente ->', p.locator('#le').inner_text())
    p.goto(BASE + '/cliente#admin'); p.wait_for_timeout(600); print('/cliente#admin continua no cliente:', p.locator('#app h2').first.inner_text())
    p.fill('#lu', 'kesfi'); p.fill('#lp', CR['kesfi']); p.click('#lf button[type=submit]'); p.wait_for_timeout(1800)
    print('cliente entrou:', p.locator('#topbar').inner_text().replace('\n', ' ')[:60], '| endereço:', p.url)
    p.locator('button:has-text("Meus pedidos")').first.click(); p.wait_for_timeout(400); p.locator('#logout').click(); p.wait_for_timeout(1500)
    print('depois de sair:', p.url, '|', p.locator('#app h2').first.inner_text())
    q = page(); q.goto(BASE + '/'); q.wait_for_timeout(700); print('página principal ainda mostra texto da equipe:', 'Equipe da loja' in q.locator('#app').inner_text())
    b.close()
print('ERROS', errs)

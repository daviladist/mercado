"""Confere se os dois apps são instaláveis (teste do próprio Chrome) e se o service worker não guarda dados."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for path in ['/', '/cliente']:
        c = b.new_context(viewport={'width': 390, 'height': 844}); c.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        p = c.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto(BASE + path); p.wait_for_timeout(2500)
        cdp = c.new_cdp_session(p)
        inst = cdp.send('Page.getInstallabilityErrors')
        man = cdp.send('Page.getAppManifest')
        sw = p.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.length)')
        import json; m = json.loads(man.get('data') or '{}')
        print(f"{path:9} manifesto: {m.get('name')} | início {m.get('start_url')} | erros de instalação: {inst.get('installabilityErrors')} | service worker: {sw} | caixa instalar: {p.locator('.instbox').count()} | {errs}")
        p.screenshot(path=os.environ.get('OUT', '/tmp') + f"/pwa{path.replace('/', '_') or '_'}.png")
        c.close()
    b.close()

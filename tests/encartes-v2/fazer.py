"""Robô que faz um encarte inteiro pela tela da equipe: python3 tests/encartes-v2/fazer.py"""
import os, functools, threading, http.server, socket
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FX = os.path.join(RAIZ, 'tests/fixtures/encartes-v2/')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORTA = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def guess_type(self, p): return 'text/javascript' if p.endswith('.js') else super().guess_type(p)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORTA), functools.partial(Q, directory=RAIZ))
threading.Thread(target=srv.serve_forever, daemon=True).start()
LISTA = """Café 3 Corações Tradicional 500g 17,98
Batata McCain Airfryer 600g 16,90
Cerveja Brahma lata 350ml c/ 12 39,90 36,90
Coxa e sobrecoxa com dorsal kg 9,79 7,79
Achocolatado Gury 1kg 9,99
Mini Chicken Perdigão 1kg 22,90
Big Chicken Perdigão queijo 1kg 23,90
Linha sem preço nenhum
Filezinho Sassami Sadia kg 24,90"""
FOTOS = {0: 'cafe.webp', 1: 'mccain.webp', 2: 'brahma.webp', 3: 'sassami.webp', 4: 'gury.webp', 5: 'minichicken.webp', 6: 'bigqueijo.webp'}
erros = []
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros.append('ERRO ' + str(e)))
    base = f'http://127.0.0.1:{PORTA}/public/encartes-v2/index.html'
    pg.goto(base + '?tela=campanhas'); pg.wait_for_function('window.PRONTO === true', timeout=20000)
    pg.click('#filtro button[data-d=""]'); pg.click('.camp.pronto[data-p="quinta-da-carne"]'); pg.wait_for_timeout(800)
    pg.click('#salvar'); pg.wait_for_timeout(500)
    pg.click('#abas button[data-tela="fazer"]'); pg.wait_for_timeout(500)
    pg.click('#dias button[data-d="4"]'); pg.click('.camp'); pg.wait_for_timeout(500)
    pg.fill('#txt', LISTA); pg.click('#add'); pg.wait_for_timeout(500)
    print('sem preço:', pg.inner_text('#semPreco'))
    for i, arq in FOTOS.items():
        it = pg.locator('.item').nth(i)
        with pg.expect_file_chooser() as fc: it.locator('[data-a="foto"]').first.click()
        fc.value.set_files(FX + arq); pg.wait_for_timeout(700)
    for i in (0, 1, 2): pg.locator('.item').nth(i).locator('[data-a="dest"]').click(); pg.wait_for_timeout(200)
    pg.locator('.item').nth(3).locator('[data-k="frase"]').select_option('Tá muito barato!'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/fazer-2-produtos.png', full_page=True)
    pg.click('#seguir'); pg.wait_for_timeout(2500)
    pg.screenshot(path='/tmp/fazer-3-conferir.png')
    url = pg.evaluate("document.querySelector('[data-c=\"0\"]').toDataURL('image/png')")
    import base64; open('/tmp/fazer-capa.png', 'wb').write(base64.b64decode(url.split(',')[1]))
    pg.click('#seguir'); pg.wait_for_timeout(500)
    with pg.expect_download() as d: pg.click('[data-b="a4eco"]')
    d.value.save_as('/tmp/fazer-a4eco.pdf'); print('baixou', d.value.suggested_filename)
    with pg.expect_download() as d: pg.click('[data-b="feed"]')
    print('baixou', d.value.suggested_filename)
    # plaquinhas do encarte
    pg.click('#abas button[data-tela="plaquinhas"]'); pg.wait_for_timeout(800)
    pg.locator('[data-id]').nth(0).locator('[data-k="perto"]').check(); pg.wait_for_timeout(400)
    pg.screenshot(path='/tmp/plaq-tela.png')
    with pg.expect_download() as d: pg.click('#pdf')
    d.value.save_as('/tmp/plaq-encarte.pdf'); print('baixou', d.value.suggested_filename)
    pg.wait_for_timeout(500)
    # avulsa digitada
    pg.click('[data-o="avulsas"]'); pg.fill('#txt', 'Óleo de soja 900ml 7,99'); pg.click('#add'); pg.wait_for_timeout(400)
    print('avulsas:', pg.locator('[data-id]').count())
    br.close()
print('erros:', erros or 'nenhum')

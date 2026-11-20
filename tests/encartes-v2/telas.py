"""Passeia pela tela de Campanhas num Chrome de verdade e tira fotos: python3 tests/encartes-v2/telas.py"""
import os, functools, threading, http.server, socket
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CAB = os.path.join(RAIZ, 'tests/fixtures/encartes-v2/cab_sabado_sem_logo.jpg')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORTA = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def guess_type(self, p): return 'text/javascript' if p.endswith('.js') else super().guess_type(p)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORTA), functools.partial(Q, directory=RAIZ))
threading.Thread(target=srv.serve_forever, daemon=True).start()
erros = []
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = br.new_page(viewport={'width': 1366, 'height': 900})
    pg.on('pageerror', lambda e: erros.append('ERRO ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
    pg.goto(f'http://127.0.0.1:{PORTA}/public/encartes-v2/index.html')
    pg.wait_for_function('window.PRONTO === true', timeout=20000)
    pg.screenshot(path='/tmp/tela-1-vazia.png')
    pg.click('#abas button[data-tela="loja"]'); pg.wait_for_timeout(300)
    pg.fill('[data-k="whatsapp"]', '(27) 99876-5432'); pg.fill('[data-k="endereco"]', 'Av. Principal, 100 - Joatuba'); pg.fill('[data-k="linkApp"]', 'https://exemplo.com/app')
    pg.click('#salvar'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/tela-0-loja.png')
    pg.click('#abas button[data-tela="campanhas"]'); pg.wait_for_timeout(300)
    pg.click('#nova')
    pg.fill('#nome', 'Sábado Imbatível')
    pg.click('#dias label:has-text("Sáb")')
    with pg.expect_file_chooser() as fc: pg.click('#cab')
    fc.value.set_files(CAB)
    pg.wait_for_timeout(1500)
    pg.click('#logosLado button[data-v="0"]')
    pg.click('#paletas button[data-p="vermelho"]')
    pg.wait_for_timeout(1500)
    pg.screenshot(path='/tmp/tela-2-editor.png')
    pg.click('#salvar'); pg.wait_for_timeout(500)
    # segunda campanha: segunda e terça, sem cabeçalho
    pg.click('#nova'); pg.fill('#nome', 'Segunda e Terça'); pg.click('#dias label:has-text("Seg")'); pg.click('#dias label:has-text("Ter")')
    pg.click('#paletas button[data-p="carne"]'); pg.click('#salvar'); pg.wait_for_timeout(400)
    pg.click('#nova'); pg.fill('#nome', 'Oferta Relâmpago'); pg.click('#dias label.todos'); pg.click('#salvar'); pg.wait_for_timeout(400)
    pg.click('#filtro button[data-d="6"]'); pg.wait_for_timeout(800)
    pg.screenshot(path='/tmp/tela-3-sabado.png')
    pg.click('#filtro button[data-d="2"]'); pg.wait_for_timeout(500)
    nomes = pg.eval_on_selector_all('.camp:not(.pronto) .nome', 'e => e.map(x => x.textContent)')
    print('terça mostra:', nomes)
    assert nomes == ['Segunda e Terça', 'Oferta Relâmpago'], nomes
    pg.click('#abas button[data-tela="modelo"]'); pg.wait_for_timeout(400); pg.screenshot(path='/tmp/tela-4-modelo.png')
    br.close()
print('erros:', erros or 'nenhum')

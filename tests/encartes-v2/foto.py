"""Tira a foto da arte de prova: python3 tests/encartes-v2/foto.py [caso] [formato] [saida.png]"""
import sys, os, base64, functools, threading, http.server, socket
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
caso = sys.argv[1] if len(sys.argv) > 1 else 'esquenta'; fmt = sys.argv[2] if len(sys.argv) > 2 else 'feed'
saida = sys.argv[3] if len(sys.argv) > 3 else f'/tmp/prova-{caso}-{fmt}.png'
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORTA = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORTA), functools.partial(Q, directory=RAIZ))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = br.new_page()
    erros = []; pg.on('pageerror', lambda e: erros.append(str(e))); pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
    pg.goto(f'http://127.0.0.1:{PORTA}/tests/encartes-v2/prova.html?caso={caso}&formato={fmt}')
    try: pg.wait_for_function('window.PRONTO === true', timeout=20000)
    except Exception as e: print('ERROS', erros); raise
    url = pg.evaluate("document.getElementById('cv').toDataURL('image/png')")
    open(saida, 'wb').write(base64.b64decode(url.split(',')[1])); print('ok', saida, erros)
    br.close()

"""Gera os cabeçalhos dos modelos prontos no formato novo (2160x800). Roda uma vez."""
import os, json, base64, functools, threading, http.server, socket, urllib.parse
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SAIDA = os.path.join(RAIZ, 'public/encartes-v2/modelos/prontos')
CABS = {
  'quinta-da-carne': dict(arq='head_quinta.jpg', fotoDe=0.46, fundo1='#2a0606', fundo2='#120303', titulo=['QUINTA', 'DA CARNE'], corDestaque='#ffc400', chamada='OFERTAS DO AÇOUGUE', corFaixa='#c81d25'),
  'quarta-imbativel': dict(arq='head_quarta.jpg', fotoDe=0.565, fundo1='#22110c', fundo2='#120806', titulo=['QUARTA', 'IMBATÍVEL'], corDestaque='#ff8a00', chamada='DIA IMPERDÍVEL', corFaixa='#d7191f'),
  'segunda-e-terca': dict(arq='head_segter.jpg', fotoDe=0.535, fundo1='#d71920', fundo2='#a80f14', titulo=['SEGUNDA E TERÇA', 'DE OFERTAS'], corDestaque='#ffd21f', chamada='PREÇO LÁ EMBAIXO', corFaixa='#16161a'),
  'ofertas-de-sabado': dict(arq='head_sabado.jpg', fotoDe=0.5, fundo1='#e2621a', fundo2='#b8470c', titulo=['OFERTAS', 'DE SÁBADO'], corDestaque='#ffffff', chamada='FIM DE SEMANA COM ECONOMIA', corFaixa='#16213e'),
  'super-dia-d': dict(arq='superdia_bg.jpg', selo=[0.0, 0.0, 0.36, 0.26], fundo1='#26262b', fundo2='#101013', titulo=['O DIA', 'MAIS BARATO', 'DO MÊS', 'CHEGOU!'], coresLinhas=['#fff3dc', '#e8431c', '#fff3dc', '#e8431c'], corDestaque='#e8431c', chamada='', corFaixa='#000', fotoDe=0),
}
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORTA = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORTA), functools.partial(Q, directory=RAIZ))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome'); pg = br.new_page()
    import sys
    for nome, c in CABS.items():
        if len(sys.argv) > 1 and nome not in sys.argv[1:]: continue
        pg.goto(f'http://127.0.0.1:{PORTA}/tests/encartes-v2/montar_cabecalhos.html?c=' + urllib.parse.quote(json.dumps(c)))
        pg.wait_for_function('window.PRONTO === true', timeout=20000)
        url = pg.evaluate("document.getElementById('cv').toDataURL('image/jpeg', 0.9)")
        open(os.path.join(SAIDA, nome + '.jpg'), 'wb').write(base64.b64decode(url.split(',')[1])); print('ok', nome)
    br.close()

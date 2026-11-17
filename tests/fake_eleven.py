"""ElevenLabs de mentira para os testes (não gasta crédito nem sai para a internet).
Uso: python3 tests/fake_eleven.py PORTA  — responde POST /v1/text-to-speech/<voz> com um mp3 curto
e GET /count com quantas falas foram pedidas. Chave esperada: 'chave-de-teste'."""
import sys, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
N = {'n': 0, 'last': None}
MP3 = open(os.environ['FAKE_MP3'], 'rb').read() if os.environ.get('FAKE_MP3') else bytes.fromhex('fffb9064') + b'\x00' * 413  # FAKE_MP3: um mp3 de verdade (teste de tela); sem ele, um quadro só
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        b = json.dumps(N).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.headers.get('xi-api-key') != 'chave-de-teste': self.send_response(401); self.end_headers(); return
        if not self.path.startswith('/v1/text-to-speech/') or not body.get('text'): self.send_response(400); self.end_headers(); return
        N['n'] += 1; N['last'] = {'voz': self.path.split('/')[3].split('?')[0], 'model': body.get('model_id'), 'text': body.get('text')}
        self.send_response(200); self.send_header('Content-Type', 'audio/mpeg'); self.end_headers(); self.wfile.write(MP3)
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()

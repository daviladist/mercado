"""ElevenLabs de mentira para os testes (não gasta crédito nem sai para a internet).
Uso: python3 tests/fake_eleven.py PORTA
 - POST /v1/text-to-speech/<voz>: devolve um mp3 curto e o cabeçalho character-cost (o custo cobrado).
   Voz que começa com "VozCara" cobra o dobro (voz de biblioteca com multiplicador); fala com "devagar" demora 1,5 s.
 - GET /v1/user/subscription: saldo da conta (FAKE_SALDO = limite do plano; padrão 30000).
 - GET /v1/voices/<voz>: 404 para voz que começa com "VozSumiu"; senão 200.
 - GET /count: quantas falas foram pedidas e a última. Chave esperada: 'chave-de-teste'."""
import sys, json, os, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
N = {'n': 0, 'last': None, 'gasto': 0}
LIM = int(os.environ.get('FAKE_SALDO') or 30000)
TRAVA = threading.Lock()
MP3 = open(os.environ['FAKE_MP3'], 'rb').read() if os.environ.get('FAKE_MP3') else bytes.fromhex('fffb9064') + b'\x00' * 413  # FAKE_MP3: um mp3 de verdade (teste de tela); sem ele, um quadro só
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def manda(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == '/count': return self.manda(200, N)
        if self.headers.get('xi-api-key') != 'chave-de-teste': return self.manda(401, {'detail': {'status': 'invalid_api_key'}})
        if self.path == '/v1/user/subscription': return self.manda(200, {'tier': 'starter', 'character_count': N['gasto'], 'character_limit': LIM, 'next_character_count_reset_unix': int(time.time()) + 86400 * 10})
        if self.path.startswith('/v1/voices/'):
            v = self.path.split('/')[3].split('?')[0]
            if v.startswith('VozSumiu'): return self.manda(404, {'detail': {'status': 'voice_not_found'}})
            return self.manda(200, {'voice_id': v, 'sharing': {'disable_at_unix': 1900000000} if v.startswith('VozSaindo') else {}})
        return self.manda(404, {})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.headers.get('xi-api-key') != 'chave-de-teste': return self.manda(401, {'detail': {'status': 'invalid_api_key'}})
        if not self.path.startswith('/v1/text-to-speech/') or not body.get('text'): return self.manda(400, {})
        voz = self.path.split('/')[3].split('?')[0]
        if voz.startswith('VozSumiu'): return self.manda(404, {'detail': {'status': 'voice_not_found', 'message': 'A voice with that id was not found.'}})
        if 'devagar' in body['text']: time.sleep(1.5)
        mult = (0.5 if body.get('model_id') == 'eleven_flash_v2_5' else 1) * (2 if voz.startswith('VozCara') else 1)
        cobra = int(-(-len(body['text']) * mult // 1))
        with TRAVA:
            if N['gasto'] + cobra > LIM: return self.manda(401, {'detail': {'status': 'quota_exceeded'}})
            N['n'] += 1; N['gasto'] += cobra; N['last'] = {'voz': voz, 'model': body.get('model_id'), 'text': body.get('text'), 'cobra': cobra}
        self.send_response(200); self.send_header('Content-Type', 'audio/mpeg'); self.send_header('character-cost', str(cobra)); self.send_header('Content-Length', str(len(MP3))); self.end_headers(); self.wfile.write(MP3)
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()

"""Bateria de testes do Gerador de Encartes (artefato do Claude), num Chrome de verdade, sem nuvem.
Uso: python3 encartes_testes.py PASTA_DO_ARTEFATO
 1. #testes: as regras de negócio do próprio app (99-testes.js) têm de passar todas.
 2. Vídeo com voz de ponta a ponta, com uma voz de mentira (tom): gera o MP4 e confere com o ffprobe
    que tem imagem H.264 + som, e que a duração bate com o tempo calculado pelas falas.
 3. A aba "Vídeo com voz" abre no painel do admin sem erro na tela nem no console.
Sai com código 1 se algo falhar."""
import sys, os, json, base64, subprocess, threading, functools, http.server, socket, tempfile
from playwright.sync_api import sync_playwright
D = os.path.abspath(sys.argv[1]); fails = []; oks = 0
def check(c, m, info=''):
    global oks
    if c: oks += 1; print('  OK  ', m)
    else: fails.append(m); print('  FALHA', m, info)
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Q, directory=D)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/index.html'
FAKE = r'''window.__VOZC={};window.__VOZN=0;window.__VOZLOG=[];window.__VOZ_FAKE=async b=>{if(b===undefined)return{ligada:true,usado:0,limite:30000,teto:30000,conta:{usado:1200,limite:30000,renova:1900000000},voz:window.__VOZSUMIU?{ok:false,some:null}:{ok:true,some:null}};
 const k=b.voz+'|'+b.modelo+'|'+b.texto,tem=!!window.__VOZC[k];window.__VOZLOG.push({t:b.texto,v:b.voz,e:!!b.estimar,r:!!b.refazer});
 if(b.estimar)return{cache:tem,cred:tem&&!b.refazer?0:String(b.texto).length};if(tem&&!b.refazer)return{audio:window.__VOZC[k],cred:0,cache:true};
 const dur=Math.max(0.6,String(b.texto).length/14),SR=24000,n=Math.round(dur*SR),buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,SR,true);v.setUint32(28,SR*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(Math.sin(i/SR*2*Math.PI*440)*30000),true);
 let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));
 window.__VOZN++;window.__VOZC[k]=btoa(s);return{audio:window.__VOZC[k],cred:String(b.texto).length,cache:false}};'''
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(viewport={'width': 1400, 'height': 1000}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    print('== 1. regras do app (#testes)')
    pg.goto(URL + '#testes'); pg.wait_for_function('window.__TESTES', timeout=30000)
    t = pg.evaluate('window.__TESTES'); check(t['ok'] == t['total'] and t['total'] >= 40, f"{t['ok']} de {t['total']} regras passaram", json.dumps(t['falhas'], ensure_ascii=False)[:1500])
    print('== 2. vídeo com voz (voz de mentira)')
    pg2 = br.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e))); pg2.add_init_script(FAKE); pg2.goto(URL); pg2.wait_for_function('typeof vozGerar==="function"&&typeof S!=="undefined"', timeout=30000)
    r = pg2.evaluate('''async()=>{S.products=[P({id:'v1',desc:'PICANHA BOVINA',unit:'kg',price:59.9,app:49.9,appOn:true,featured:true}),P({id:'v2',desc:'Arroz Tio João 5kg',price:24.9}),P({id:'v3',desc:'Coca-Cola 2L',price:9.99}),P({id:'v4',desc:'Feijão 1kg',price:7.49})];
      S.voz={sel:['v1','v3'],falas:{},fmt:'story'};await fontsReady();const R=vozRoteiro(),c=vozCfg();const L=vozTempos(await vozFalas(R,c)),tot=L.reduce((a,s)=>a+s.d,0);
      const mix=await vozMix(L,tot,null,0);const r=await vozVideo(1080,1920,L,mix,()=>{});const ab=new Uint8Array(await r.blob.arrayBuffer());let s='';for(let i=0;i<ab.length;i+=8192)s+=String.fromCharCode(...ab.subarray(i,i+8192));
      return{tot,ext:r.ext,audio:r.audio,b64:btoa(s),n:window.__VOZN,falas:R.map(x=>x.fala),ds:L.map(x=>x.d)}}''')
    check(r['ext'] == 'mp4', 'saiu MP4', r['ext']); check(r['n'] == 4, 'pediu 4 falas (abertura, 2 produtos, fechamento)', r['n'])
    check(r['falas'][1] == 'Picanha Bovina: no app, só quarenta e nove e noventa o quilo!', 'fala da picanha', r['falas'][1])
    f = tempfile.mktemp(suffix='.mp4'); open(f, 'wb').write(base64.b64decode(r['b64']))
    pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], capture_output=True, text=True).stdout or '{}')
    st = {x['codec_type']: x for x in pr.get('streams', [])}
    check('video' in st and st['video']['codec_name'] == 'h264' and st['video']['width'] == 1080 and st['video']['height'] == 1920, 'imagem H.264 1080x1920', st.get('video', {}).get('codec_name'))
    aac = pg2.evaluate('vozAacOk()'); cod = st.get('audio', {}).get('codec_name', 'nenhum')
    check('audio' in st and cod == ('aac' if aac else 'opus') and r['audio'] == cod, 'tem som (' + cod + (')' if aac else '; este computador não tem AAC, só serve para o teste)'))
    dur = float(pr.get('format', {}).get('duration', 0)); check(abs(dur - r['tot']) < 0.6, f'duração {dur:.1f}s = tempo das falas {r["tot"]:.1f}s')
    vol = subprocess.run(['ffmpeg', '-v', 'info', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mv = [l for l in vol.splitlines() if 'max_volume' in l]; pico = float(mv[0].split(':')[1].split()[0]) if mv else -99
    check(-6 < pico <= 0.0, 'o som está nivelado: nem mudo nem estourado (pico %.1f dB)' % pico, mv)
    os.makedirs('/tmp/voz_saida', exist_ok=True); os.replace(f, '/tmp/voz_saida/teste_story_voz.mp4')
    r2 = pg2.evaluate('''async()=>{const R=vozRoteiro().map(s=>Object.assign({},s,{fala:''}));const L=vozTempos(R);const r=await vozVideo(1080,1350,L,null,()=>{});return{ext:r.ext,size:r.blob.size,tot:L.reduce((a,s)=>a+s.d,0)}}''')
    check(r2['ext'] == 'mp4' and r2['size'] > 10000, 'feed sem voz também sai (teste)')
    print('== 3. aba no painel do admin')
    pg2.evaluate('()=>{setUi("dono")}'); pg2.click('#tabs [data-t=voz]'); pg2.wait_for_selector('#vzGo', timeout=10000)
    txt = pg2.inner_text('#t-voz').lower(); check('abertura' in txt and 'fechamento' in txt and 'créditos' in txt, 'aba mostra abertura, produtos, fechamento e créditos')
    check(pg2.is_enabled('#vzGo'), 'botão "Gerar vídeo com voz" liberado quando a voz está ligada')
    check('saldo de verdade' in pg2.inner_text('#vzBox') and '1.200' in pg2.inner_text('#vzBox'), 'mostra o saldo de verdade da ElevenLabs')
    # ouvir uma fala antes do vídeo: a que já foi gerada toca sem perguntar nem gastar; a nova pergunta antes
    n0 = pg2.evaluate('window.__VOZN'); pg2.click('#vzList .vzP[data-id="v1"] [data-a=ouvir]'); pg2.wait_for_function('window.__VOZTOCOU>=1', timeout=10000)
    check(pg2.evaluate('window.__VOZN') == n0 and not pg2.is_visible('#modal'), 'Ouvir fala já gravada: toca direto, sem gastar')
    pg2.fill('#vzAbre', 'Chegou a Quinta da Carne!'); pg2.dispatch_event('#vzAbre', 'change'); pg2.click('[data-ouvir=abre]'); pg2.wait_for_selector('#modal:not([hidden]) [data-a=y]')
    check('25 créditos' in pg2.inner_text('#mbody') and pg2.evaluate('window.__VOZN') == n0, 'Ouvir fala nova: avisa o custo antes de gastar', pg2.inner_text('#mbody')[:120])
    pg2.click('#modal [data-a=y]'); pg2.wait_for_function('window.__VOZTOCOU>=2', timeout=10000); check(pg2.evaluate('window.__VOZN') == n0 + 1, 'confirmou: grava a fala uma vez e toca')
    pg2.click('[data-denovo=abre]'); pg2.wait_for_selector('#modal:not([hidden]) [data-a=y]'); check('de novo' in pg2.inner_text('#mbody').lower() and pg2.evaluate('window.__VOZN') == n0 + 1, 'Gravar de novo: avisa que gasta outra vez')
    pg2.click('#modal [data-a=n]'); check(pg2.evaluate('window.__VOZN') == n0 + 1, 'cancelou: não gasta')
    # nome falado corrigido fica guardado e entra na fala automática
    pg2.fill('#vzList .vzP[data-id="v1"] .vzNome', 'Picanha Bovina de primeira'); pg2.dispatch_event('#vzList .vzP[data-id="v1"] .vzNome', 'change')
    check(pg2.evaluate('falaDe(S.products[0])') == 'Picanha Bovina de primeira: no app, só quarenta e nove e noventa o quilo!' and pg2.evaluate('S.vozNomes[nomeKey("PICANHA BOVINA")]') == 'Picanha Bovina de primeira', 'nome corrigido fica guardado e entra na fala', pg2.evaluate('falaDe(S.products[0])'))
    pg2.fill('#vzList .vzP[data-id="v1"] .vzNome', ''); pg2.dispatch_event('#vzList .vzP[data-id="v1"] .vzNome', 'change'); check(pg2.evaluate('falaDe(S.products[0])') == 'Picanha Bovina: no app, só quarenta e nove e noventa o quilo!', 'apagar o nome volta ao automático')
    # sem AAC o app não gera nem gasta; com AAC, o vídeo sai e o som é AAC
    n1 = pg2.evaluate('window.__VOZN'); pg2.evaluate('()=>{window.__SALVOU=null;const o=saveFile;window.saveFile=saveFile=function(n,b,t){window.__SALVOU={n,size:b.size};}}')
    if not aac:
        pg2.evaluate('()=>{window.reviewGate=reviewGate=async()=>true}'); pg2.click('#vzGo'); pg2.wait_for_selector('#modal:not([hidden]) [data-a=y]')
        check('AAC' in pg2.inner_text('#mbody') and pg2.evaluate('window.__VOZN') == n1 and pg2.evaluate('window.__SALVOU') is None, 'computador sem AAC: avisa, não gasta crédito e não salva vídeo')
        pg2.click('#modal [data-a=y]')
    else:
        pg2.evaluate('()=>{window.reviewGate=reviewGate=async()=>true}'); pg2.click('#vzGo'); pg2.wait_for_selector('#modal:not([hidden]) [data-a=y]'); pg2.click('#modal [data-a=y]')
        pg2.wait_for_function('window.__SALVOU', timeout=180000); check(pg2.evaluate('window.__SALVOU.n').endswith('.mp4'), 'computador com AAC: salva o MP4 com voz')
    # comparar vozes: a mesma fala em cada voz; só gasta na que mandar gravar; "Usar esta voz" troca a voz do vídeo
    pg2.evaluate('()=>{document.querySelector("#t-voz details.sec").open=true}'); pg2.click('#vzComp'); pg2.wait_for_selector('#vcList .vcRow')
    pg2.wait_for_function('[...document.querySelectorAll("#vcList [data-a=ouvir]")].every(b=>!b.disabled)', timeout=10000)
    nv = pg2.evaluate('document.querySelectorAll("#vcList .vcRow").length'); rot = pg2.evaluate('[...document.querySelectorAll("#vcList [data-a=ouvir]")].map(b=>b.textContent)')
    check(nv == 8 and rot[0] == '▶ Ouvir' and 'créditos' in rot[1], 'Comparar vozes: lista as 8 vozes; a já gravada toca de graça, as outras mostram o custo no botão', rot[:3])
    n2 = pg2.evaluate('window.__VOZN'); tc = pg2.evaluate('window.__VOZTOCOU'); pg2.click('#vcList .vcRow[data-v="BEufRj0H7KMKUaQ7dCsj"] [data-a=ouvir]'); pg2.wait_for_function('window.__VOZTOCOU>%d' % tc, timeout=10000)
    check(pg2.evaluate('window.__VOZN') == n2 + 1 and pg2.evaluate('window.__VOZLOG.filter(x=>!x.e).pop().v') == 'BEufRj0H7KMKUaQ7dCsj', 'gravar uma voz para comparar gasta só aquela voz')
    pg2.wait_for_function('document.querySelector(\'#vcList .vcRow[data-v="BEufRj0H7KMKUaQ7dCsj"] [data-a=ouvir]\').textContent==="▶ Ouvir"'); tc = pg2.evaluate('window.__VOZTOCOU')
    pg2.click('#vcList .vcRow[data-v="BEufRj0H7KMKUaQ7dCsj"] [data-a=ouvir]'); pg2.wait_for_function('window.__VOZTOCOU>%d' % tc, timeout=10000); check(pg2.evaluate('window.__VOZN') == n2 + 1, 'ouvir de novo a voz já gravada não gasta')
    pg2.click('#vcList .vcRow[data-v="BEufRj0H7KMKUaQ7dCsj"] [data-a=usar]'); check(pg2.evaluate('vozCfg().voz') == 'BEufRj0H7KMKUaQ7dCsj' and not pg2.is_visible('#modal'), '"Usar esta voz" troca a voz do vídeo')
    pg2.evaluate('()=>{S.vozCfg=Object.assign(vozCfg(),{voz:VOZES[0][0]});renderVoz()}')
    # voz que sumiu da ElevenLabs: avisa e trava o botão
    pg2.evaluate('async()=>{window.__VOZSUMIU=true;await vozInfo();renderVoz()}'); check('não está na sua conta' in pg2.inner_text('#vzBox') and not pg2.is_enabled('#vzGo'), 'voz que sumiu: avisa e não deixa gerar')
    pg2.evaluate('async()=>{window.__VOZSUMIU=false;await vozInfo();renderVoz()}')
    pg2.click('#vzList .vzP[data-id="v2"] .vzChk input'); check(pg2.evaluate('S.voz.sel.join()') == 'v1,v2,v3', 'marcar produto mantém a ordem do encarte', pg2.evaluate('S.voz.sel.join()'))
    pg2.fill('#vzList .vzP[data-id="v2"] textarea', 'Arroz Tio João, cinco quilos, imperdível!'); pg2.dispatch_event('#vzList .vzP[data-id="v2"] textarea', 'change')
    check(pg2.evaluate('falaDe(S.products[1])') == 'Arroz Tio João, cinco quilos, imperdível!', 'fala editada fica guardada')
    pg2.click('#vzList .vzP[data-id="v2"] [data-a=auto]'); check(pg2.evaluate('S.voz.falas.v2===undefined'), 'volta para a fala automática')
    pg3 = br.new_page(); pg3.on('pageerror', lambda e: errs.append(str(e))); pg3.goto(URL); pg3.wait_for_function('typeof renderVoz==="function"')
    pg3.evaluate('()=>{setUi("dono")}'); pg3.click('#tabs [data-t=voz]'); pg3.wait_for_selector('#vzMudo')
    check(not pg3.is_enabled('#vzGo') and 'não liga' in pg3.inner_text('#t-voz'), 'no Claude (sem Tino): avisa e só deixa gerar sem voz')
    check(not errs, 'nenhum erro de script', errs[:3])
    br.close()
srv.shutdown()
print(f'\n{oks} OK, {len(fails)} falha(s)'); [print(' -', m) for m in fails]; sys.exit(1 if fails else 0)

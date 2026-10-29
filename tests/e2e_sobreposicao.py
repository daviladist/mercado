"""Nenhum texto/botão por baixo das partes fixas (cabeçalho, abas, faixas), em todas as telas, com o app aberto no topo.
Simula o iPhone com o app instalado (barra de status de 47 px: --sat). Uso: BASE=... CREDS=... ADMIN_PASSWORD=... python3 tests/e2e_sobreposicao.py
"""
import json, os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3077'); CR = json.load(open(os.environ['CREDS']))['final']; ADMIN = os.environ['ADMIN_PASSWORD']
SAT = os.environ.get('SAT', '47px'); OUT = os.environ.get('OUT', '/tmp')
CHECK = r"""()=>{
  const fixed=[...document.querySelectorAll('header.top,#app .tabs,#app .navband,#app .subnavwrap,.cnav,#app .catbar')].filter(e=>e.offsetParent!==null);
  const inFixed=el=>fixed.some(f=>f.contains(el));
  const bars=fixed.map(f=>{const r=f.getBoundingClientRect();return {el:f,top:r.top,bottom:r.bottom}});
  const bad=[];
  document.querySelectorAll('#app *, #cnav *').forEach(el=>{
    if(inFixed(el)||el.offsetParent===null)return;
    const kids=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!(kids||el.matches('button,input,select,textarea,img,svg')))return;
    const r=el.getBoundingClientRect();if(r.height<2||r.width<2||r.bottom<0)return;
    for(const b of bars){ if(b.el.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING && r.top<b.bottom-1 && r.bottom>b.top){bad.push((el.innerText||el.tagName).trim().slice(0,30)+' @'+Math.round(r.top)+' < '+Math.round(b.bottom));break} }
  });
  return bad.slice(0,5)}"""
fails = []; seen = 0
def chk(pg, name):
    global seen
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(250)
    bad = pg.evaluate(CHECK); seen += 1
    print(('  OK    ' if not bad else '  FALHA ') + name + ('' if not bad else ': ' + ' | '.join(bad)))
    if bad: fails.append(name); pg.screenshot(path=f'{OUT}/sobre_{len(fails)}.png')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(path):
        pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        pg.add_init_script(f"document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--sat','{SAT}'))")
        pg.goto(BASE + path); pg.wait_for_timeout(700); return pg
    for path, nm in [('/', 'login (equipe)'), ('/cliente', 'login (cliente)'), ('/#admin', 'login admin')]:
        chk(page(path), nm)
    pg = page('/#admin'); pg.fill('#lu', 'eduardo'); pg.fill('#lp', ADMIN); pg.click('#lf button[type=submit]'); pg.wait_for_timeout(2200)
    tabs = pg.evaluate("()=>[...document.querySelectorAll('.tabs [data-tab]')].map(b=>[b.dataset.tab,b.innerText])")
    for k, label in tabs:
        pg.click(f'.tabs [data-tab="{k}"]'); pg.wait_for_timeout(600); chk(pg, 'admin › ' + label)
        subs = pg.evaluate("()=>[...document.querySelectorAll('.subnav [data-tab], .finseg button, .cadg [data-cadg]')].map(b=>[b.dataset.tab?'[data-tab=\"'+b.dataset.tab+'\"]':b.dataset.cadg?'[data-cadg=\"'+b.dataset.cadg+'\"]':null,b.innerText]).filter(x=>x[0])")
        for sel, sl in subs:
            pg.click('#app ' + sel); pg.wait_for_timeout(600); chk(pg, f'admin › {label} › {sl}')
            for c in pg.evaluate("()=>[...document.querySelectorAll('.cadsub [data-cad]')].map(b=>[b.dataset.cad,b.innerText])"):
                pg.click(f'.cadsub [data-cad="{c[0]}"]'); pg.wait_for_timeout(500); chk(pg, f'admin › {label} › {sl} › {c[1]}')
    for hv, f, u, nm in [('/#vendedor', ('#vdlu', '#vdlp', '#vdl'), 'vend', 'vendedor'), ('/#conferente', ('#cflu', '#cflp', '#cfl'), '1', 'conferente'), ('/#faturamento', ('#fblu', '#fblp', '#fbl'), 'm', 'faturamento'), ('/#entregador', ('#dvlu', '#dvlp', '#dvl'), 'ze', 'entregador')]:
        q = page(hv); q.fill(f[0], u); q.fill(f[1], CR[u]); q.click(f[2] + ' button[type=submit]'); q.wait_for_timeout(2000); chk(q, nm)
        for btn in q.evaluate("()=>[...document.querySelectorAll('#app .navband button')].map(b=>b.outerHTML.match(/data-[a-z]+=\"[^\"]*\"/)?.[0]).filter(Boolean)"):
            q.click('#app .navband [' + btn + ']'); q.wait_for_timeout(500); chk(q, nm + ' › ' + btn)
    c = page('/cliente'); c.fill('#lu', 'kesfi'); c.fill('#lp', CR['kesfi']); c.click('#lf button[type=submit]'); c.wait_for_timeout(2200)
    for k in ['catalogo', 'pedidos', 'dados']:
        c.click(f'[data-cp="{k}"]'); c.wait_for_timeout(600); chk(c, 'cliente › ' + k)
    b.close()
print(f'\nRESULTADO: {seen - len(fails)} telas ok, {len(fails)} com sobreposição')
sys.exit(1 if fails else 0)

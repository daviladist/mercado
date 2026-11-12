"""Gera a versão do Gerador de Encartes para o Tino (public/encartes.html + public/encartes/app.js)
a partir do app do Claude (index.html). A CSP do Tino não deixa script na página nem bibliotecas de fora."""
import re,sys,os
src=open(sys.argv[1]).read(); out=sys.argv[2]
head_end=src.index('</head>')
m=re.search(r'<script>\n?(.*)</script>\s*</body>',src,re.S)
js=m.group(1); html=src[:m.start()]+'<script src="/encartes/tino.js"></script>\n</body>'+src[m.end():]
def R(s,a,b,need=True):
    if need and a not in s: raise SystemExit('não achei: '+a[:80])
    return s.replace(a,b)
# bibliotecas: a versão nova do app as traz em lib/ (com o CDN de reserva); no Tino ficam em /vendor
html=R(html,'<script src="lib/jspdf.umd.min.js"></script>','<script src="/vendor/jspdf-2.5.1.umd.min.js"></script>')
html=R(html,'<script src="lib/qrcode.min.js"></script>','<script src="/vendor/qrcode-generator-1.4.4.js"></script>')
html=R(html,'<link href="lib/fonts.css" rel="stylesheet">','<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">')
html=R(html,'<title>Gerador de Encartes</title>','''<title>Gerador de Encartes</title>
<meta name="theme-color" content="#16181d">
<link rel="manifest" href="/equipe.webmanifest">
<link rel="apple-touch-icon" href="/icons/tino-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/tino-192.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Encartes">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">''')
html=R(html,'onclick="wzGo(1)"','data-wzgo="1"',False); html=R(html,'onclick="wzGo(3)"','data-wzgo="3"',False)
for a,b in [('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js','/vendor/zxing-library-0.21.3.min.js'),
            ('https://cdn.jsdelivr.net/npm/ag-psd@34.1.0/dist/bundle.js','/vendor/ag-psd-34.1.0.js'),
            ('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js','/vendor/mp4-muxer-5.2.2.js'),
            ('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','/vendor/jspdf-2.5.1.umd.min.js'),
            ('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','/vendor/jszip-3.10.1.min.js'),
            ('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js','/vendor/qrcode-generator-1.4.4.js')]:
    js=js.replace(a,b)
js=R(js,"const LOCALLIB={'jszip.min.js':'lib/jszip.min.js','mp4-muxer.js':'lib/mp4-muxer.js','index.min.js':'lib/zxing.min.js','bundle.js':'lib/ag-psd.js'}",
     "const LOCALLIB={'jszip.min.js':'/vendor/jszip-3.10.1.min.js','mp4-muxer.js':'/vendor/mp4-muxer-5.2.2.js','index.min.js':'/vendor/zxing-library-0.21.3.min.js','bundle.js':'/vendor/ag-psd-34.1.0.js'}")
js=re.sub(r"(['\"])modelos/",r"\1/encartes/modelos/",js)
js=R(js,"loadImg('/_blob/'+id)","loadImg((window.ENC_BLOB||'/_blob/')+id)")
# download direto quando não há o recurso de downloads do Claude
js=R(js," const url=URL.createObjectURL(blob);\n modal(`<h3>Seu arquivo</h3>",
     " const url=URL.createObjectURL(blob);\n if(window.TINO){const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Arquivo baixado: '+name);return true}\n modal(`<h3>Seu arquivo</h3>")
js+="\ndocument.querySelectorAll('[data-wzgo]').forEach(b=>b.addEventListener('click',()=>wzGo(+b.dataset.wzgo)));\n"
assert 'cdn.jsdelivr' not in js and 'cdnjs' not in js, 'sobrou biblioteca de fora'
assert not re.search(r'\son[a-z]+="',html), 'sobrou onclick na página'
os.makedirs(os.path.join(out,'encartes'),exist_ok=True)
open(os.path.join(out,'encartes.html'),'w').write(html)
open(os.path.join(out,'encartes','app.js'),'w').write("'use strict';\n/* Gerador de Encartes (Tino). Gerado de encartes/index.html por tools/to_tino.py: não editar à mão. */\n"+js)
print('ok',len(html),len(js))

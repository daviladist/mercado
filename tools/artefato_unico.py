"""Junta o artefato multiarquivo (index.html + app/*.js + app/estilo.css) num index.html de arquivo único,
no formato que tools/to_tino.py espera (CSS em <style>, todo o JS num <script> antes de </body>)."""
import re,sys,os
d=sys.argv[1]; out=sys.argv[2]; incl_tests='--testes' in sys.argv
h=open(os.path.join(d,'index.html')).read()
css=open(os.path.join(d,'app/estilo.css')).read()
h=h.replace('<link href="app/estilo.css" rel="stylesheet">','<style>\n'+css.rstrip('\n')+'\n</style>')
srcs=re.findall(r'<script src="(app/[^"]+)"></script>\n?',h)
js=''
for s in srcs:
    if s.endswith('99-testes.js') and not incl_tests: continue
    js+=open(os.path.join(d,s)).read().rstrip('\n')+'\n'
h=re.sub(r'(<script src="app/[^"]+"></script>\n?)+','<script>\n'+js.replace('\\','\\\\')+'</script>\n',h,count=1)
open(out,'w').write(h); print('bundle',len(h),len(srcs))

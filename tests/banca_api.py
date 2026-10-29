"""Testes dos 43 itens da banca de revisão (pela API, como um atacante ou um usuário com internet ruim faria).
Uso: BASE=http://localhost:3077 CREDS=.../creds.json ADMIN_PASSWORD=... python3 tests/banca_api.py
Sai com código 1 se qualquer item falhar. Roda num banco de TESTE (nunca na produção).
"""
import json, os, sys, copy, math, threading, urllib.request, http.cookiejar, uuid
BASE = os.environ.get('BASE', 'http://localhost:3077')
CREDS = json.load(open(os.environ['CREDS']))['final']
ADMIN_PASS = os.environ['ADMIN_PASSWORD']
ok_count = 0; fails = []

def check(cond, msg):
    global ok_count
    if cond: ok_count += 1; print('  OK   ', msg)
    else: fails.append(msg); print('  FALHA', msg)

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None, headers=None, raw_body=None):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if (body is not None or raw_body is not None) else {}
        if headers is not None: h = headers
        data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
        r = urllib.request.Request(BASE + path, data=data, headers=h, method='POST' if data is not None else 'GET')
        try:
            with self.op.open(r) as resp: txt = resp.read(); return resp.status, json.loads(txt or b'{}')
        except urllib.error.HTTPError as e:
            txt = e.read()
            try: return e.code, json.loads(txt or b'{}')
            except Exception: return e.code, {'raw': txt[:200]}
    def login(self, login, pw, role=''): return self.req('/api/login', {'role': role, 'login': login, 'password': pw})
    def state(self):
        s, J = self.req('/api/state'); return J
    def put(self, c, doc, ver=None, base=None):
        ch = {'c': c, 'id': doc['id'], 'op': 'put', 'doc': doc}
        if ver is not None: ch['ver'] = ver
        if base is not None: ch['base'] = base
        return self.req('/api/sync', {'changes': [ch]})

def rejected(s, r): return s in (400, 403) or (s == 200 and bool(r.get('rejected')))
def accepted(s, r): return s == 200 and not r.get('rejected')
def doc_of(r, c, id_):
    x = [d for d in r.get('docs', []) if d['c'] == c and d['id'] == id_]
    return (x[0]['doc'], x[0].get('ver')) if x else (None, None)
uid = lambda p='t': p + uuid.uuid4().hex[:10]

adm = Client(); s, _ = adm.login('eduardo', ADMIN_PASS); check(s == 200, 'administrador entra')
A = adm.state(); AS = A['S']
C = {}
for lg in ['kesfi', 'pirilampo', 'vend', '1', 'm', 'ze']:
    c = Client(); s, me = c.login(lg, CREDS[lg]); C[lg] = (c, me); check(s == 200, f'{lg} entra')
cli, cme = C['kesfi']; ven, vme = C['vend']; conf, _ = C['1']; fat, _ = C['m']; ent, eme = C['ze']
kesfi = [x for x in AS['customers'] if x['id'] == cme['refId']][0]
prods = [p for p in AS['products'] if p.get('active') is not False and float(p.get('price') or 0) > 0 and not p.get('kg')]
P0, P1 = prods[0], prods[1]
MIN = float(AS['store'].get('min') or 0)
QMIN = lambda p: max(5, math.ceil(MIN * 2.5 / float(p['price'])))
CASH = (AS.get('cashPays') or ['Dinheiro'])[0]
TERM = [x for x in AS['payments'] if x not in (AS.get('cashPays') or [])]
TERM = TERM[0] if TERM else AS['payments'][0]

def item(p, q, price=None):
    return {'pid': p['id'], 'name': p['name'], 'unit': p.get('unit', ''), 'perPack': p.get('perPack') or '', 'q': q, 'price': price if price is not None else float(p['price']), 'base': float(p['price']), 'cost': p.get('cost') or ''}

def mk_order(status='novo', cust=None, items=None, pay=None, **extra):
    """pedido montado pelo administrador (que pode tudo) para preparar cada cenário"""
    cust = cust or kesfi; items = items or [item(P0, QMIN(P0))]
    sub = round(sum(i['q'] * i['price'] for i in items), 2)
    o = {'id': uid('o'), 'date': '2026-10-28T12:00:00.000Z', 'customerId': cust['id'], 'customer': cust['name'], 'items': items, 'sub': sub, 'disc': 0, 'total': sub,
         'mode': 'entrega', 'pay': pay or TERM, 'status': status, 'nf': None, 'events': []}
    if status in ('pronto', 'saiu', 'concluido') and 'billed' not in extra: o['billed'] = {'nf': '1', 'at': '2026-10-28T12:00:00.000Z', 'by': 'teste'}
    o.update(extra)
    s, r = adm.put('orders', o); d, v = doc_of(r, 'orders', o['id'])
    assert accepted(s, r) and d, (s, r)
    return d, v

def fresh(c, oid):
    J = c.state(); o = [x for x in J['S']['orders'] if x['id'] == oid]
    return (o[0], J['V']['orders'][oid]) if o else (None, None)

def recs_of(oid): return [r for r in adm.state()['S']['receivables'] if r.get('orderId') == oid]

drv = eme['refId']
# ===================================================================== (a) dinheiro, dados e controle
print('\n== 1. XSS guardado pelo entregador')
o, v = mk_order('saiu', pay=CASH, deliv={'drv': drv, 'outAt': '2026-10-28T12:00:00.000Z'})
eo, ev = fresh(ent, o['id'])
evil = {'id': uid('r'), 'orderId': o['id'], 'desc': 'Não pagou na entrega', 'amount': o['total'], 'due': '2026-10-30" onmouseover="x', 'group': '<img src=x onerror=alert(1)>'}
s, r = ent.put('receivables', evil)
check(s == 200 and any(d['id'] == evil['id'] for d in r.get('drops', [])), 'conta a receber criada pelo navegador do entregador é descartada')
check(not [x for x in adm.state()['S']['receivables'] if x['id'] == evil['id']], 'nada da conta forjada ficou gravado')
x = copy.deepcopy(eo); x['status'] = 'concluido'
x['delivered'] = {'name': 'Fulano', 'photo': 'data:image/png;base64,iVBORw0KGgo=', 'how': 'pix'}
x['occ'] = {'items': [{'t': 'avaria', 'name': 'x', 'q': '<img src=x onerror=alert(1)>', 'u': 'pk'}]}
s, r = ent.put('orders', x, ev); check(rejected(s, r), f'ocorrência com HTML na quantidade: recusada ({r.get("rejected") or r.get("error")})')
h = urllib.request.urlopen(BASE + '/').headers.get('Content-Security-Policy', '')
sp = [p for p in h.split(';') if p.strip().startswith('script-src')]
check(sp and "'unsafe-inline'" not in sp[0], f'CSP sem script inline ({sp[0].strip() if sp else "sem CSP"})')
html = urllib.request.urlopen(BASE + '/').read().decode()
check('<script>' not in html and '/app.js' in html, 'página não tem script inline (código em /app.js)')

print('\n== 2/3. Itens de pedido concluído não mudam (cliente, vendedor, conferente, entregador)')
o, v = mk_order('concluido', pay=TERM, appr='aceito', sellerId=vme['refId'], delivered={'drv': drv, 'name': 'X', 'at': '2026-10-28T12:00:00.000Z'})
r0 = recs_of(o['id'])
for nm, c in [('cliente', cli), ('vendedor', ven), ('conferente', conf), ('entregador', ent)]:
    co, cv = fresh(c, o['id'])
    if not co: check(True, f'{nm}: nem vê o pedido concluído'); continue
    x = copy.deepcopy(co); x['items'][0]['q'] = 1
    s, r = c.put('orders', x, cv); check(rejected(s, r), f'{nm} reduz quantidade de pedido concluído: recusado')
    x = copy.deepcopy(co); x['items'] = []
    s, r = c.put('orders', x, cv); check(rejected(s, r), f'{nm} tira os produtos de pedido concluído: recusado')
A2 = adm.state(); o2 = [y for y in A2['S']['orders'] if y['id'] == o['id']][0]
check(o2['total'] == o['total'] and len(recs_of(o['id'])) == len(r0), f'total e contas a receber intactos ({o2["total"]}, {len(r0)} parcelas)')

print('\n== 4. Ajuste de entrega sem limite')
o, v = mk_order('saiu', pay=TERM, items=[item(P0, 10)], deliv={'drv': drv})
eo, ev = fresh(ent, o['id'])
base_d = {'name': 'Fulano', 'photo': 'data:image/png;base64,iVBORw0KGgo=', 'how': ''}
x = copy.deepcopy(eo); x['status'] = 'concluido'; x['delivered'] = base_d; x['occ'] = {'items': [{'t': 'avaria', 'name': 'a', 'q': 1, 'u': 'un'}]}
x['items'] += [{'name': 'Avariado', 'unit': 'ajuste na entrega', 'q': 1, 'price': -float(P0['price']), 'occLine': True} for _ in range(40)]
s, r = ent.put('orders', x, ev); check(rejected(s, r), 'entregador lança 40 ajustes de -1 fardo sem origem: recusado')
pk = int(P0.get('perPack') or 1)
if pk > 1:
    x = copy.deepcopy(eo); x['status'] = 'concluido'; x['delivered'] = base_d; x['occ'] = {'items': [{'t': 'avaria', 'name': 'a', 'q': 1, 'u': 'un'}]}
    x['items'].append({'name': 'Avariado: 1 lata', 'unit': 'ajuste na entrega', 'q': 1, 'price': -40, 'occLine': True, 'src': P0['id'], 'units': 1})
    s, r = ent.put('orders', x, ev); d, _ = doc_of(r, 'orders', o['id'])
    exp = round(float(P0['price']) / pk, 2)
    check(accepted(s, r) and d and abs(d['items'][-1]['price'] + exp) < 0.011, f'ajuste de 1 unidade: o servidor recalcula o valor (R$ {exp}, não R$ 40)')
    check(d and d['total'] > 0, 'pedido continua com total positivo')
else: check(True, 'produto sem unidades na embalagem: teste de unidade não se aplica')

print('\n== 5. /api/neg não revela o custo')
negp = [p for p in prods if float(p.get('cost') or 0) > 0][0]
res = [cli.req('/api/neg', {'pid': negp['id'], 'asked': float(negp['price']) * f, 'from': 999999, 'q': 10})[1] for f in (0.99, 0.98, 0.985, 0.975, 0.97, 0.96)]
check(all('from' in x for x in res[:4]) and all(abs(x['from'] - 999999) > 1 for x in res[:4] if 'from' in x), 'o preço de partida é calculado no servidor (o "from" do navegador é ignorado)')
check(res[-1].get('limit') or res[-2].get('limit'), f'mais de 4 consultas no mesmo produto em 15 min: para de responder ({[x.get("st") for x in res]})')
s, r = ven.req('/api/lock', {'cid': kesfi['id'], 'cart': {P0['id']: 10}, 'over': {P0['id']: float(P0['price']) * 0.8}, 'mode': 'retirada', 'pay': TERM})
need = (r.get('K') or {}).get('need')
check(s == 200 and (need is None or abs(need * 10 - round(need * 10)) < 1e-6), f'trava do vendedor: "quanto falta" arredondado em R$ 0,10 ({need})')

print('\n== 6. Pedido em análise/contraproposta/recusado não anda')
for ap in ['pendente', 'contra', 'recusado']:
    o, v = mk_order('novo', appr=ap)
    co, cv = fresh(conf, o['id'])
    if co:
        x = copy.deepcopy(co); x['status'] = 'separando'
        s, r = conf.put('orders', x, cv); check(rejected(s, r), f'conferente começa a separar pedido "{ap}": recusado')
    else: check(True, f'conferente nem recebe pedido "{ap}" como liberado')
o, v = mk_order('separado', appr='pendente')
fo, fv = fresh(fat, o['id']); x = copy.deepcopy(fo); x['billed'] = {'nf': '123'}; x['status'] = 'pronto'
s, r = fat.put('orders', x, fv); check(rejected(s, r), 'faturamento fatura pedido em análise: recusado')
o, v = mk_order('novo', appr='contra')
co, cv = fresh(cli, o['id']); x = copy.deepcopy(co); x['appr'] = 'recusado'
s, r = cli.put('orders', x, cv); check(rejected(s, r), 'cliente recusa a contraproposta sem cancelar: recusado (recusar = cancelar)')
x['status'] = 'cancelado'; s, r = cli.put('orders', x, cv); check(accepted(s, r), 'cliente recusa e cancela: aceito')

print('\n== 7/22. Bloqueio de login')
c = Client(); codes = [c.login('pirilampo', 'Errada-%d9x' % i)[0] for i in range(5)]
s, r = c.login('pirilampo', 'Errada-x9'); check(s == 429, f'5 senhas erradas seguidas: bloqueia ({codes + [s]})')
s, r = Client().login('pirilampo', CREDS['pirilampo']); check(s == 429, 'continua bloqueado no mesmo aparelho/IP mesmo com a senha certa')
pir = [x for x in AS['customers'] if x.get('login') == 'pirilampo'][0]
s, r = adm.req('/api/users/reset', {'coll': 'customers', 'id': pir['id'], 'pass': 'Base-' + uuid.uuid4().hex[:8]})
s2, r2 = Client().login('pirilampo', 'qualquer-coisa1'); check(s == 200 and s2 == 401, f'"Redefinir senha" da loja destrava o usuário ({s}, depois {s2})')
s, r = Client().login('vend', CREDS['vend'], 'cliente-only')
check(s == 403 and 'só para clientes' in r.get('error', ''), f'equipe no link /cliente com a senha certa: aviso claro, sem contar erro ({r.get("error")})')
s, r = Client().login('vend', CREDS['vend']); check(s == 200, 'e depois entra normalmente pelo app da equipe')
alvo = [x for x in AS['customers'] if x['id'] != kesfi['id'] and len(''.join(ch for ch in str(x.get('doc', '')) if ch.isdigit())) >= 11]
dg = ''.join(ch for ch in str(alvo[0].get('doc', '')) if ch.isdigit()) if alvo else ''
if len(dg) >= 11:
    c = Client(); variants = [dg, dg[:2] + '.' + dg[2:], ' ' + dg, dg[:5] + '-' + dg[5:], dg + ' ']
    codes = [c.login(vv, 'Errada-x9')[0] for vv in variants] + [c.login(dg, 'Errada-x9')[0]]
    check(codes[-1] == 429, f'variações do CNPJ contam como o mesmo usuário ({codes})')
    adm.req('/api/users/reset', {'coll': 'customers', 'id': alvo[0]['id'], 'pass': 'Base-' + uuid.uuid4().hex[:8]})
else: check(True, 'cliente sem CNPJ: teste de variações não se aplica')
s1, r1 = Client().login('ninguem-existe', 'Errada-x9'); s2, r2 = Client().login('m', 'Errada-x9')
check(r1.get('error', '').split('.')[0] == r2.get('error', '').split('.')[0], 'mesma mensagem para usuário inexistente e senha errada (não revela quem existe)')

print('\n== 8/11. Contas "não pagou": uma só por pedido, feita pelo servidor; entregas seguidas gravam')
oids = []
for k in range(2):
    o, v = mk_order('saiu', pay=CASH, deliv={'drv': drv}); oids.append(o['id'])
for oid in oids:
    eo, ev = fresh(ent, oid); x = copy.deepcopy(eo); x['status'] = 'concluido'; x['delivered'] = dict(base_d, how='nao')
    ch = [{'c': 'orders', 'id': oid, 'op': 'put', 'doc': x, 'ver': ev}] + [{'c': 'receivables', 'id': uid('r'), 'op': 'put', 'doc': {'orderId': oid, 'desc': 'Não pagou na entrega', 'amount': eo['total']}} for _ in range(3)]
    s, r = ent.req('/api/sync', {'changes': ch}); check(accepted(s, r), f'entrega "não pagou" grava ({s} {r.get("rejected") or r.get("error") or ""})')
for oid in oids:
    rr = recs_of(oid); check(len(rr) == 1 and rr[0]['id'] == 'np-' + oid, f'pedido com exatamente 1 conta "não pagou" gerada pelo servidor ({len(rr)})')

print('\n== 9. Vendedor: quantidade e preço absurdos')
for q, pr, nm in [(1e300, float(P0['price']), 'quantidade 1e300'), (1e-9, float(P0['price']), 'quantidade 0,000000001'), (2.5, float(P0['price']), 'quantidade quebrada'), (QMIN(P0), 0, 'preço zero'), (QMIN(P0), float(P0['price']) * 100, 'preço 100x a tabela'), (1, float(P0['price']), 'abaixo do pedido mínimo')]:
    d = {'id': uid('v'), 'customerId': kesfi['id'], 'items': [{'pid': P0['id'], 'q': q, 'price': pr}], 'mode': 'retirada', 'pay': TERM}
    s, r = ven.put('orders', d)
    if nm == 'abaixo do pedido mínimo' and MIN <= 0: check(True, 'loja sem pedido mínimo'); continue
    check(rejected(s, r), f'vendedor manda {nm}: recusado ({(r.get("rejected") or [{}])[0].get("error") or r.get("error")})')

print('\n== 12. Usuário repetido em outro papel: recusa só aquele cadastro')
ck = {'id': uid('ck'), 'name': 'Duda Mesmo Login', 'login': 'vend', 'pass': 'base-56789'}
st = copy.deepcopy(AS['store']); st['name'] = AS['store']['name']; st['pickup'] = (AS['store'].get('pickup') or '') + ' '
s, r = adm.req('/api/sync', {'changes': [{'c': 'checkers', 'id': ck['id'], 'op': 'put', 'doc': ck}, {'c': 'meta', 'id': 'store', 'op': 'put', 'doc': st, 'ver': A['V']['meta'].get('store')}]})
check(s == 200 and any(x['id'] == ck['id'] and 'já é usado' in x['error'] for x in r.get('rejected', [])), 'cadastro com login de outra pessoa: recusado com a mensagem certa')
check(any(d['c'] == 'meta' and d['id'] == 'store' for d in r.get('docs', [])), 'a outra alteração do mesmo envio foi gravada')

print('\n== 14/29/30. Faturamento')
o, v = mk_order('separado', nf={'doc': '1', 'name': 'x'})
fo, fv = fresh(fat, o['id'])
for nf, nm in [('', 'sem número (pedido com nota)'), ('abc-DEF', 'com letras'), ('-1', 'negativa')]:
    x = copy.deepcopy(fo); x['billed'] = {'nf': nf}; x['status'] = 'pronto'
    s, r = fat.put('orders', x, fv); check(rejected(s, r), f'NF {nm}: recusada')
x = copy.deepcopy(fo); x['billed'] = {'nf': '4.501'}; x['status'] = 'pronto'
s, r = fat.put('orders', x, fv); d, _ = doc_of(r, 'orders', o['id'])
check(accepted(s, r) and d and d['billed']['nf'] == '4501', 'NF válida: aceita (só números)')
o, v = mk_order('concluido', billed={'nf': '99', 'at': '2026-10-28T12:00:00Z', 'by': 'x'})
fo, fv = fresh(fat, o['id']); x = copy.deepcopy(fo); x.pop('billed', None)
s, r = fat.put('orders', x, fv); check(rejected(s, r), 'faturamento "desfatura" pedido concluído: recusado')

print('\n== 15. Vendedor aprova a troca pedida pelo conferente')
o, v = mk_order('separando', sellerId=vme['refId'], items=[item(P0, QMIN(P0))], sugs=[{'id': 'sg1', 'type': 'troca', 'fromKey': P0['id'], 'fromName': P0['name'], 'pid': P1['id'], 'name': P1['name'], 'q': QMIN(P0), 'by': 'Conf', 'at': '2026-10-28T12:00:00Z', 'status': 'pendente', 'toSeller': True}])
vo, vv = fresh(ven, o['id']); x = copy.deepcopy(vo); x['sugs'][0]['status'] = 'aprovada'
s, r = ven.put('orders', x, vv); d, _ = doc_of(r, 'orders', o['id'])
check(accepted(s, r) and d and d['items'][0]['pid'] == P1['id'] and d['sugs'][0]['status'] == 'aprovada', f'troca aprovada pelo vendedor: aplicada ({r.get("rejected") or ""})')

print('\n== 16. Duas conclusões ao mesmo tempo baixam o estoque das duas')
sp_ = [p for p in prods if str(p.get('stock', '')).strip() not in ('', 'None')]
if sp_:
    pS = sp_[0]
    adm_st = adm.state(); pp = [p for p in adm_st['S']['products'] if p['id'] == pS['id']][0]; s0 = float(pp['stock'])
    os_ = [mk_order('saiu', pay=TERM, items=[item(pS, 6)], deliv={'drv': drv}) for _ in range(2)]
    def deliver(oid, res):
        c = Client(); c.login('ze', CREDS['ze']); eo, ev = fresh(c, oid); x = copy.deepcopy(eo); x['status'] = 'concluido'; x['delivered'] = base_d
        res.append(c.put('orders', x, ev))
    res = []; th = [threading.Thread(target=deliver, args=(o['id'], res)) for o, _ in os_]
    [t.start() for t in th]; [t.join() for t in th]
    pp = [p for p in adm.state()['S']['products'] if p['id'] == pS['id']][0]
    check(all(accepted(*x) for x in res) and abs(float(pp['stock']) - (s0 - 12)) < 1e-6, f'estoque {s0} - 6 - 6 = {float(pp["stock"])}')
else: check(True, 'nenhum produto com estoque controlado: teste não se aplica')

print('\n== 18. Tirar produto até ficar com menos de 5 volta o preço negociado')
its = [dict(item(p, 10, round(float(p['price']) * 0.9, 2)), negAsk=round(float(p['price']) * 0.9, 2), negFrom=float(p['price']), negSt='an') for p in prods[:5]]
o, v = mk_order('novo', items=its, appr='contra', negCli=True)
co, cv = fresh(cli, o['id']); x = copy.deepcopy(co); x['items'] = x['items'][:4]; x['appr'] = 'aceito'
s, r = cli.put('orders', x, cv); d, _ = doc_of(r, 'orders', o['id'])
check(accepted(s, r) and d and all(abs(i['price'] - i['negFrom']) < 0.01 for i in d['items']), 'com 4 produtos, todos voltam ao preço de tabela')

print('\n== 20. Loja cancela pedido concluído pela API: estoque volta e parcelas saem')
if sp_:
    o, v = mk_order('concluido', pay=TERM, items=[item(pS, 4)])
    st1 = float([p for p in adm.state()['S']['products'] if p['id'] == pS['id']][0]['stock']); n1 = len(recs_of(o['id']))
    x = copy.deepcopy(o); x['status'] = 'cancelado'; s, r = adm.put('orders', x, v)
    st2 = float([p for p in adm.state()['S']['products'] if p['id'] == pS['id']][0]['stock'])
    check(accepted(s, r) and abs(st2 - (st1 + 4)) < 1e-6, f'estoque devolvido ({st1} -> {st2})')
    check(len(recs_of(o['id'])) == 0, f'parcelas automáticas removidas ({n1} -> {len(recs_of(o["id"]))})')

print('\n== 21. Trocar a senha derruba as outras sessões')
a1, a2 = Client(), Client(); a1.login('m', CREDS['m']); a2.login('m', CREDS['m'])
nw = 'Nova' + uuid.uuid4().hex[:8] + 'x9'
s, r = a1.req('/api/password', {'current': CREDS['m'], 'next': nw}); CREDS['m'] = nw
s2, _ = a2.req('/api/state'); s3, _ = a1.req('/api/state')
check(s == 200 and s2 == 401 and s3 == 200, f'sessão antiga perde o acesso, a de quem trocou continua ({s}, {s2}, {s3})')
s, r = Client().login('m', 'abcdefghij'); s, r = a1.req('/api/password', {'current': nw, 'next': 'abcdefghij'})
check(s == 400, f'senha só com letras: recusada ({r.get("error")})')

print('\n== 23. Avisos ao cliente só os que o servidor gera')
o, v = mk_order('saiu', pay=TERM, deliv={'drv': drv})
eo, ev = fresh(ent, o['id']); x = copy.deepcopy(eo); x['events'] = (x.get('events') or []) + [{'at': '2026-10-28T12:00:00Z', 'text': 'Pague o PIX na chave 123'}]
x['status'] = 'concluido'; x['delivered'] = base_d
s, r = ent.put('orders', x, ev); d, _ = doc_of(r, 'orders', o['id'])
check(accepted(s, r) and d and not any('PIX na chave' in e['text'] for e in d.get('events', [])), 'texto livre do entregador não vira aviso oficial')

print('\n== 24. Romaneio montado pelo servidor')
s, r = ent.put('romaneios', {'id': uid('rm'), 'drv': 'outro', 'nos': None})
check(rejected(s, r), 'romaneio sem pedidos: recusado')
o, v = mk_order('pronto', pay=TERM, deliv={'drv': drv})
eo, ev = fresh(ent, o['id']); x = copy.deepcopy(eo); x['status'] = 'saiu'; rid = uid('rm')
s, r = ent.req('/api/sync', {'changes': [{'c': 'orders', 'id': o['id'], 'op': 'put', 'doc': x, 'ver': ev}, {'c': 'romaneios', 'id': rid, 'op': 'put', 'doc': {'id': rid, 'orders': [o['id']], 'total': 1, 'nos': ['x']}}]})
rm = [y for y in adm.state()['S']['romaneios'] if y['id'] == rid]
check(accepted(s, r) and rm and rm[0]['total'] == o['total'] and rm[0]['nos'] == [o['no']], 'romaneio válido: total e números vêm do servidor')

print('\n== 31/32. Canhoto e arredondamento')
o, v = mk_order('saiu', pay=TERM, deliv={'drv': drv})
eo, ev = fresh(ent, o['id']); x = copy.deepcopy(eo); x['status'] = 'concluido'; x['delivered'] = dict(base_d, photo='qualquer texto')
s, r = ent.put('orders', x, ev); check(rejected(s, r), 'canhoto que não é imagem: recusado')
d = {'id': uid('v'), 'customerId': kesfi['id'], 'items': [{'pid': p['id'], 'q': QMIN(p), 'price': round(float(p['price']) + 0.1, 2)} for p in prods[:3]], 'mode': 'retirada', 'pay': TERM}
s, r = ven.put('orders', d); od, _ = doc_of(r, 'orders', d['id'])
check(od and abs(od['total'] * 100 - round(od['total'] * 100)) < 1e-9, f'total gravado com 2 casas ({od and od["total"]})')

print('\n== 33. Entradas malformadas e diversos')
s, r = cli.req('/api/sync', raw_body=b'{isso nao e json'); check(s == 400, f'JSON quebrado: 400 ({s})')
s, r = cli.req('/api/sync', {'changes': []}, headers={'Content-Type': 'application/json', 'X-App': '1', 'Origin': 'null'}); check(s == 403, f'Origin "null": recusado ({s})')
s, r = adm.req('/api/sync', {'changes': [{'c': 'meta', 'id': 'products', 'op': 'put', 'doc': []}]}); check(rejected(s, r), 'administrador grava "meta" com nome de coleção: recusado')
s, r = cli.req('/api/sync', {'changes': [{'c': 'orders', 'id': 'x' * 200, 'op': 'put', 'doc': {}}]}); check(rejected(s, r), 'id gigante: recusado (não é cortado)')
codes = [Client().req('/api/setup', {'code': 'x' * 20, 'name': 'a', 'login': 'abc', 'password': 'x'})[0] for _ in range(11)]
check(codes[-1] == 429, f'/api/setup com limite de tentativas ({codes[-3:]})')
s, st = adm.req('/api/state'); check(s == 200, '/api/state continua funcionando')

print(f'\nRESULTADO: {ok_count} ok, {len(fails)} falhas')
for f in fails: print('  -', f)
sys.exit(1 if fails else 0)

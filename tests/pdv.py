"""Testes do PDV (caixa de balcão) pela API, num banco de TESTE vazio com o administrador da principal criado.
Uso: BASE=... CENTRAL_PASSWORD=... ADMIN_LOGIN=... ADMIN_PASSWORD=... python3 tests/pdv.py
Sai com código 1 se algo falhar.
"""
import json, os, secrets, sys, urllib.request, http.cookiejar, concurrent.futures as cf
BASE = os.environ.get('BASE', 'http://localhost:3077')
CPW = os.environ['CENTRAL_PASSWORD']; AL = os.environ.get('ADMIN_LOGIN', 'eduardo'); APW = os.environ['ADMIN_PASSWORD']
ok = 0; fails = []
def check(cond, msg):
    global ok
    if cond: ok += 1; print('  OK  ', msg)
    else: fails.append(msg); print('  FALHA', msg)
class C:
    def __init__(self, t='@'):
        self.t = t; self.jar = http.cookiejar.CookieJar(); self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, body=None, raw=False):
        h = {'Content-Type': 'application/json', 'X-App': '1'} if body is not None else {}
        if self.t: h['X-Tenant'] = self.t
        r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method='POST' if body is not None else 'GET')
        try:
            with self.op.open(r) as x: d = x.read(); return x.status, (d.decode() if raw else json.loads(d or b'{}'))
        except urllib.error.HTTPError as e:
            d = e.read(); return e.code, (d.decode() if raw else json.loads(d or b'{}'))
def pw(): return 'Tt' + secrets.token_urlsafe(10).replace('-', 'x').replace('_', 'y') + '7a'
sid = lambda: 'v' + secrets.token_hex(10)

A = C(); s, _ = A.req('/api/login', {'role': 'admin', 'login': AL, 'password': APW}); check(s == 200, 'administrador entra')
s, st = A.req('/api/state'); V = st['V']
# dados de exemplo: 2 produtos com custo, 1 cliente com IE e limite de fiado, 1 sem limite, 1 operador de caixa
OPW = pw()
ch = [
  {'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'Arroz 5kg', 'price': 25, 'cost': 20, 'stock': 100, 'code': '101', 'ean': '7890000000011', 'unit': 'UN', 'active': True}},
  {'c': 'products', 'id': 'pb', 'op': 'put', 'doc': {'id': 'pb', 'name': 'Feijão 1kg', 'price': 8, 'cost': 5, 'stock': 50, 'code': '102', 'ean': '7890000000028', 'unit': 'UN', 'active': True}},
  {'c': 'customers', 'id': 'cf', 'op': 'put', 'doc': {'id': 'cf', 'name': 'Mercadinho Fiado', 'doc': '11.222.333/0001-81', 'creditLimit': 100}},
  {'c': 'customers', 'id': 'cn', 'op': 'put', 'doc': {'id': 'cn', 'name': 'Cliente Sem Limite', 'doc': '22.333.444/0001-90'}},
  {'c': 'customers', 'id': 'cv', 'op': 'put', 'doc': {'id': 'cv', 'name': 'Cliente Devendo', 'doc': '33.444.555/0001-00', 'creditLimit': 500}},
  {'c': 'receivables', 'id': 'rv1', 'op': 'put', 'doc': {'id': 'rv1', 'customerId': 'cv', 'customer': 'Cliente Devendo', 'amount': 30, 'due': '2026-01-10', 'paidAt': '', 'parcel': '1/1', 'desc': 'antiga'}},
  {'c': 'cashiers', 'id': 'op1', 'op': 'put', 'doc': {'id': 'op1', 'name': 'Operadora Ana', 'login': 'ana.caixa', 'pass': OPW}},
  {'c': 'meta', 'id': 'pdv', 'op': 'put', 'doc': {'maxDesc': 5, 'minMg': 10, 'fiadoDias': 30, 'pixKey': '11222333000181', 'pixName': 'LOJA TESTE', 'pixCity': 'VITORIA'}, 'ver': V['meta'].get('pdv')},
]
s, r = A.req('/api/sync', {'changes': ch}); check(s == 200 and not r.get('rejected'), 'cadastros de exemplo gravados: %s' % (r.get('rejected') or ''))

print('== módulo desligado')
s, r = A.req('/api/pdv/state'); check(s == 403, 'PDV desligado: a API do caixa não abre')
op = C(); s, r = op.req('/api/login', {'role': 'operador_caixa', 'login': 'ana.caixa', 'password': OPW}); check(s == 403, 'PDV desligado: operador de caixa não entra')
cen = C(None); cen.req('/api/central/login', {'login': 'super_admin', 'password': CPW})
s, cs = cen.req('/api/central/state'); dav = next(t for t in cs['tenants'] if t['primary'])
check(dav['modules']['pdv'] is False, 'na empresa principal o PDV começa DESLIGADO (o dono liga na Central)')
s, r = cen.req('/api/central/tenant', {'id': dav['id'], 'modules': {'pdv': True}}); check(s == 200 and r['tenant']['modules']['pdv'], 'Central liga o PDV')

print('== operador de caixa: entra e nunca vê custo nem margem')
op = C(); s, me = op.req('/api/login', {'role': 'operador_caixa', 'login': 'ana.caixa', 'password': OPW}); check(s == 200 and me['role'] == 'operador_caixa', 'operador entra')
NPW = pw(); s, _ = op.req('/api/password', {'current': OPW, 'next': NPW}); check(s == 200, 'operador cria a própria senha')
s, raw = op.req('/api/state', raw=True); stj = json.loads(raw)
check(s == 200 and len(stj['S']['products']) == 2, 'operador recebe os produtos')
check('"cost"' not in raw and 'refCost' not in raw and 'tablePrices' not in raw and 'minMg' not in raw and '"stock"' not in raw, 'estado do operador NÃO tem custo, margem nem estoque')
check(stj['S'].get('pdv') is None and stj['S']['orders'] == [] and stj['S']['receivables'] == [] and not any('phone' in c for c in stj['S']['customers']), 'operador não recebe configuração interna, pedidos nem contas')
check(any(c['id'] == 'cf' for c in stj['S']['customers']), 'operador vê clientes para escolher no F4')
s, pst = op.req('/api/pdv/state'); check(s == 200 and pst['caixa'] is None and pst['cfg']['pixKey'] and 'minMg' not in pst['cfg'], 'estado do caixa sem margem mínima e sem caixa aberto')
s, q = op.req('/api/pdv/quote', {'items': [{'pid': 'pa', 'q': 2}]}, raw=True); check(s == 200 and 'cost' not in q and 'margem' not in q.lower() and '"total":50' in q.replace(' ', ''), 'cotação do servidor sem custo: ' + q[:120])
s, _ = op.req('/api/pdv/resumo'); check(s == 403, 'operador não abre o resumo (margem do balcão)')
s, r = op.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pa', 'op': 'put', 'doc': {'id': 'pa', 'name': 'x', 'price': 1}}]}); check(s in (400, 403, 409) or r.get('rejected'), 'operador não altera produto (%s)' % s)
s, r = op.req('/api/sync', {'changes': [{'c': 'products', 'id': 'pz', 'op': 'put', 'doc': {'id': 'pz', 'name': 'x', 'price': 1}}]}); check(s in (400, 403) or r.get('rejected'), 'operador não cria produto (%s %s)' % (s, r))

print('== caixa e vendas')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': 'x', 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 25}], 'totalEsperado': 25}); check(s == 409, 'sem caixa aberto não vende')
s, r = op.req('/api/pdv/caixa/abrir', {'fundo': 100}); CX = r.get('caixa', {}).get('id'); check(s == 200 and CX, 'abre o caixa com fundo de troco')
s, _ = op.req('/api/pdv/caixa/abrir', {'fundo': 50}); check(s == 409, 'não abre dois caixas para o mesmo operador')
V1 = sid(); venda = {'id': V1, 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 2}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 60, 'recebido': 60}], 'totalEsperado': 50}
s, r = op.req('/api/pdv/venda', venda); check(s == 200 and r['numero'] == 1 and r['troco'] == 10, 'venda em dinheiro com troco calculado no servidor: %s' % r)
s, r2 = op.req('/api/pdv/venda', venda); check(s == 200 and r2.get('repetida') and r2['numero'] == 1, 'clique duplo: a mesma venda não grava duas vezes')
s, st = A.req('/api/state'); pa = next(p for p in st['S']['products'] if p['id'] == 'pa'); check(pa['stock'] == 98, 'estoque baixou 2 (uma vez só): %s' % pa['stock'])
bad = {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 2}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 1}], 'totalEsperado': 1}
s, r = op.req('/api/pdv/venda', bad); check(s == 409 and 'não confere' in r.get('error', ''), 'preço adulterado no aparelho é RECUSADO: %s' % r.get('error'))
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 20}], 'totalEsperado': 25}); check(s == 400 and 'Falta' in r.get('error', ''), 'pagamento menor que o total é recusado')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'debito', 'valor': 30}], 'totalEsperado': 25}); check(s == 400, 'troco só sai de dinheiro (débito maior que o total é recusado)')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'pix', 'valor': 25}], 'totalEsperado': 25}); check(s == 400 and 'PIX' in r.get('error', ''), 'PIX precisa ser conferido')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}, {'pid': 'pb', 'q': 1, 'cancel': {'motivo': 'cliente desistiu'}}], 'pagamentos': [{'forma': 'pix', 'valor': 10, 'conferido': True}, {'forma': 'credito', 'valor': 15}], 'totalEsperado': 25})
check(s == 200, 'pagamento misto (PIX + crédito) com item cancelado com motivo')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pb', 'q': 1, 'cancel': {'motivo': ''}}, {'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 25}], 'totalEsperado': 25}); check(s == 400, 'cancelar item sem motivo é recusado')

print('== desconto e senha do gerente')
d5 = {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 4}], 'desconto': {'tipo': 'pct', 'valor': 5}, 'pagamentos': [{'forma': 'dinheiro', 'valor': 95}], 'totalEsperado': 95}
s, r = op.req('/api/pdv/venda', d5); check(s == 200, 'desconto dentro do limite (5%) sem gerente')
d10 = {'id': sid(), 'caixaId': CX, 'customerId': '', 'items': [{'pid': 'pa', 'q': 4}], 'desconto': {'tipo': 'pct', 'valor': 10}, 'pagamentos': [{'forma': 'dinheiro', 'valor': 90}], 'totalEsperado': 90}
s, q = op.req('/api/pdv/quote', d10); check(s == 200 and q['needAuth'] is True and 'abaixoMargem' not in q, 'cotação avisa que o desconto de 10% precisa de gerente (sem revelar margem)')
d15 = dict(d10, desconto={'tipo': 'pct', 'valor': 15})
s, r = op.req('/api/pdv/autorizar', dict(d15, gerente={'login': AL, 'senha': APW})); check(s == 200 and r.get('alerta'), 'ao autorizar, o GERENTE é avisado que a margem fica abaixo da mínima')
s, q = op.req('/api/pdv/quote', dict(d10, desconto={'tipo': 'pct', 'valor': 4})); check(q['needAuth'] is False, 'desconto dentro do limite do caixa não depende da margem (custo não vaza por tentativa)')
s, r = op.req('/api/pdv/venda', d10); check(s == 403 and r.get('needAuth'), 'desconto acima do limite sem gerente é recusado')
s, r = op.req('/api/pdv/autorizar', dict(d10, gerente={'login': AL, 'senha': 'errada123x'})); check(s == 403, 'senha de gerente errada é recusada')
s, r = op.req('/api/pdv/autorizar', dict(d10, gerente={'login': 'ana.caixa', 'senha': NPW})); check(s == 403, 'operador não autoriza o próprio desconto (só administrador)')
s, r = op.req('/api/pdv/autorizar', dict(d10, gerente={'login': AL, 'senha': APW})); TK = r.get('token'); check(s == 200 and TK, 'gerente autoriza')
s, r = op.req('/api/pdv/venda', dict(d10, items=[{'pid': 'pa', 'q': 5}], totalEsperado=112.5, pagamentos=[{'forma': 'dinheiro', 'valor': 112.5}], autorizacao=TK)); check(s == 403, 'autorização não vale para OUTRA venda (itens mudaram)')
s, r = op.req('/api/pdv/venda', dict(d10, autorizacao=TK)); check(s == 200 and r.get('autorizadoPor'), 'venda com desconto autorizado: %s' % r.get('autorizadoPor'))
s, r = op.req('/api/pdv/venda', dict(d10, id=sid(), autorizacao=TK)); check(s == 403, 'autorização vale uma vez só')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'desconto': {'tipo': 'valor', 'valor': 25}, 'pagamentos': [{'forma': 'dinheiro', 'valor': 1}], 'totalEsperado': 0}); check(s == 400, 'desconto do valor inteiro é recusado')

print('== fiado')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pb', 'q': 1}], 'pagamentos': [{'forma': 'fiado', 'valor': 8}], 'totalEsperado': 8}); check(s == 400, 'fiado sem cliente é recusado')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'customerId': 'cn', 'items': [{'pid': 'pb', 'q': 1}], 'pagamentos': [{'forma': 'fiado', 'valor': 8}], 'totalEsperado': 8}); check(s == 400 and 'limite' in r.get('error', ''), 'fiado para cliente sem limite é recusado')
s, q = op.req('/api/pdv/quote', {'customerId': 'cf', 'items': [{'pid': 'pb', 'q': 5}]}); check(q.get('fiado', {}).get('disponivel') == 100, 'cotação mostra o fiado disponível do cliente')
FV = sid(); s, r = op.req('/api/pdv/venda', {'id': FV, 'caixaId': CX, 'customerId': 'cf', 'items': [{'pid': 'pb', 'q': 5}], 'pagamentos': [{'forma': 'fiado', 'valor': 40}], 'totalEsperado': 40}); check(s == 200, 'venda no fiado para cliente com limite')
s, st = A.req('/api/state'); rec = [x for x in st['S']['receivables'] if x.get('pdvVenda') == FV]
check(len(rec) == 1 and rec[0]['amount'] == 40 and rec[0]['customerId'] == 'cf' and rec[0]['paidAt'] == '', 'fiado gerou conta a receber do cliente: %s' % (rec[:1]))
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'customerId': 'cf', 'items': [{'pid': 'pa', 'q': 3}], 'pagamentos': [{'forma': 'fiado', 'valor': 75}], 'totalEsperado': 75}); check(s == 400 and 'limite' in r.get('error', ''), 'fiado acima do disponível (60) é recusado')

s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'customerId': 'cv', 'items': [{'pid': 'pb', 'q': 1}], 'pagamentos': [{'forma': 'fiado', 'valor': 8}], 'totalEsperado': 8}); check(s == 400 and 'vencidas' in r.get('error', ''), 'cliente com conta VENCIDA não compra fiado (mesma regra do app): %s' % r.get('error'))
s, q = op.req('/api/pdv/quote', {'customerId': 'cv', 'items': [{'pid': 'pb', 'q': 1}]}); check(q.get('fiado', {}).get('motivo'), 'cotação já avisa o caixa do bloqueio do fiado')
# dois caixas vendendo fiado ao MESMO cliente ao mesmo tempo: o disponível é 60, cada venda é de 40 -> só uma passa
def fiado40(_):
    return op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'customerId': 'cf', 'items': [{'pid': 'pb', 'q': 5}], 'pagamentos': [{'forma': 'fiado', 'valor': 40}], 'totalEsperado': 40})[0]
with cf.ThreadPoolExecutor(4) as ex: res = list(ex.map(fiado40, range(4)))
check(res.count(200) == 1, 'fiado em paralelo não estoura o limite (1 de 4 passou): %s' % res)
# centavos do desconto: 3 linhas de 8,00 com R$ 1,00 de desconto -> 7,67 + 7,67 + 7,66 = 23,00
s, q = op.req('/api/pdv/quote', {'items': [{'pid': 'pb', 'q': 1}, {'pid': 'pb', 'q': 1}, {'pid': 'pb', 'q': 1}], 'desconto': {'tipo': 'valor', 'valor': 1}})
check(s == 200 and round(sum(l['total'] for l in q['lines']), 2) == q['total'] == 23, 'soma das linhas fecha no total com desconto: %s' % [l['total'] for l in q['lines']])

print('== venda feita sem internet')
s, st0 = A.req('/api/state'); est0 = next(p for p in st0['S']['products'] if p['id'] == 'pa')['stock']
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 20}], 'totalEsperado': 20, 'offline': True}); check(s == 200 and r['status'] == 'falha', 'venda "sem internet" com valor diferente NÃO vira venda: fica com problema para o gerente')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 10}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 0.01}], 'totalEsperado': 0.01, 'offline': True}); check(s == 200 and r['status'] == 'falha', '"sem internet" + R$ 0,01 por 10 itens: não grava venda')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 4}], 'desconto': {'tipo': 'pct', 'valor': 90}, 'pagamentos': [{'forma': 'dinheiro', 'valor': 10}], 'totalEsperado': 10, 'offline': True}); check(s == 200 and r['status'] == 'falha', '"sem internet" + 90% de desconto sem gerente: não grava venda')
s, st1 = A.req('/api/state'); check(next(p for p in st1['S']['products'] if p['id'] == 'pa')['stock'] == est0, 'nenhuma dessas tentativas baixou estoque')

FX = sid(); offx = {'id': FX, 'caixaId': CX, 'items': [{'pid': 'nao-existe', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 10}], 'totalEsperado': 10, 'offline': True}
s, r = op.req('/api/pdv/venda', offx); check(s == 200 and r['status'] == 'falha', 'venda sem internet que não dá para gravar NÃO some: fica "com problema" para o gerente')
s, r = op.req('/api/pdv/venda', offx); check(s == 200 and r.get('repetida'), 'reenviar a mesma venda com problema não duplica')

print('== código de barras, sangria e suprimento')
s, r = op.req('/api/pdv/ean', {'pid': 'pb', 'ean': '7891234567895', 'gerente': {'login': AL, 'senha': 'nada'}}); check(s == 403, 'vincular código sem a senha do gerente é recusado')
s, r = op.req('/api/pdv/ean', {'pid': 'pb', 'ean': '7890000000011', 'gerente': {'login': AL, 'senha': APW}}); check(s == 409, 'código que já é de outro produto é recusado')
s, r = op.req('/api/pdv/ean', {'pid': 'pb', 'ean': '7891234567895', 'gerente': {'login': AL, 'senha': APW}}); check(s == 200, 'gerente vincula código novo ao produto')
s, r = op.req('/api/pdv/caixa/mov', {'tipo': 'sangria', 'valor': 50}); check(s == 403, 'sangria sem gerente é recusada')
s, r = op.req('/api/pdv/caixa/mov', {'tipo': 'sangria', 'valor': 9999, 'gerente': {'login': AL, 'senha': APW}}); check(s == 400, 'sangria maior que o dinheiro do caixa é recusada')
s, r = op.req('/api/pdv/caixa/mov', {'tipo': 'sangria', 'valor': 50, 'motivo': 'cofre', 'gerente': {'login': AL, 'senha': APW}}); check(s == 200, 'sangria com gerente')
s, r = op.req('/api/pdv/caixa/mov', {'tipo': 'suprimento', 'valor': 20, 'motivo': 'troco', 'gerente': {'login': AL, 'senha': APW}}); check(s == 200, 'suprimento com gerente')

print('== fechamento às cegas')
# dinheiro esperado: fundo 100 + 50 (venda 1) + 95 + 90 - 50 + 20 = 305 (vendas com problema não entram no caixa)
s, r = op.req('/api/pdv/caixa/fechar', {'contado': {'dinheiro': 320, 'pix': 10, 'debito': 0, 'credito': 15}}); check(s == 200 and r['esperado']['dinheiro'] == 305 and r['diferenca'] == 15, 'fechamento compara com o esperado e acha a diferença (+15): %s %s' % (r.get('esperado'), r.get('diferenca')))
s, r = op.req('/api/pdv/venda', dict(venda, id=sid())); check(s == 409, 'caixa fechado não vende')
s, R = A.req('/api/pdv/resumo'); check(s == 200 and len(R['diferencas']) == 1 and R['margem'] is not None and len(R['falhas']) == 4, 'painel avisa a diferença e a venda a revisar; margem do balcão para o administrador')
check(any(v.get('autorizou') for v in R['lista']), 'painel mostra quem autorizou o desconto')
s, r = A.req('/api/pdv/justificar', {'id': R['diferencas'][0]['id'], 'texto': 'troco errado na venda 3'}); s2, R2 = A.req('/api/pdv/resumo'); check(s == 200 and not R2['diferencas'], 'justificada, a diferença sai do aviso')

s, R = A.req('/api/pdv/resumo'); check(len(R.get('falhas', [])) == 4, 'painel mostra as vendas sem internet com problema')
for f in R['falhas']: s, _ = A.req('/api/pdv/falha', {'id': f['id'], 'texto': 'conferido com o operador'})
s2, R2 = A.req('/api/pdv/resumo'); check(s == 200 and not R2['falhas'], 'gerente resolve as vendas com problema')
s, r = op.req('/api/pdv/venda', {'id': sid(), 'caixaId': CX, 'items': [{'pid': 'pa', 'q': 1}], 'pagamentos': [{'forma': 'dinheiro', 'valor': 25}], 'totalEsperado': 25, 'offline': True, 'clientAt': '2026-10-30T10:00:00Z'})
check(s == 200 and r['status'] == 'revisar', 'venda sem internet que chega depois do caixa fechado entra no caixa dela, "a revisar"')

print('== enviar para faturamento (NF-e)')
s, r = A.req('/api/pdv/faturar', {'id': V1}); check(s == 400, 'venda sem cliente não vira pedido (NF-e precisa de cliente)')
s, r = A.req('/api/pdv/faturar', {'id': FV}); check(s == 200 and r.get('no'), 'venda com cliente vira pedido em "A faturar" (nº %s)' % r.get('no'))
s, r2 = A.req('/api/pdv/faturar', {'id': FV}); check(s == 409, 'não envia duas vezes')
s, st = A.req('/api/state'); o = next((x for x in st['S']['orders'] if x.get('pdvVenda') == FV), None)
check(o and o['status'] == 'separado' and o.get('recLaunched') and o['stockApplied'].get('pb') == 5, 'pedido não baixa estoque de novo nem gera outra conta')
pb = next(p for p in st['S']['products'] if p['id'] == 'pb'); check(pb['stock'] == 40 and pb['ean'] == '7890000000028' and '7891234567895' in pb.get('eans', []), 'estoque do feijão = 40 (item cancelado não baixou); código vinculado entrou JUNTO com o antigo: %s' % pb['stock'])

check(abs(sum(i['price'] * i['q'] for i in o['items']) - o['total']) < 0.005 and o['total'] == 40, 'pedido da NF-e: soma dos itens = total pago')
# o pedido segue o fluxo normal (pronto, depois cancelado): estoque e contas NÃO mudam
for novo in ('pronto', 'cancelado'):
    s, st = A.req('/api/state'); o = next(x for x in st['S']['orders'] if x.get('pdvVenda') == FV); vo = st['V']['orders'][o['id']]
    s, r = A.req('/api/sync', {'changes': [{'c': 'orders', 'id': o['id'], 'op': 'put', 'doc': dict(o, status=novo), 'ver': vo}]}); check(s == 200 and not r.get('rejected'), 'pedido do balcão vai para "%s"' % novo)
s, st = A.req('/api/state'); pb = next(p for p in st['S']['products'] if p['id'] == 'pb'); recs = [x for x in st['S']['receivables'] if x.get('customerId') == 'cf']
check(pb['stock'] == 40, 'mudar a situação do pedido do balcão NÃO devolve nem baixa estoque de novo: %s' % pb['stock'])
check(len(recs) == 2, 'nem gera conta a receber a mais: %s' % len(recs))

print('== outra empresa não vê o caixa desta')
s, r = cen.req('/api/central/tenant', {'name': 'Loja PDV ' + secrets.token_hex(2), 'segment': 'basico', 'status': 'ativa', 'modules': {'pdv': True}}); TB = r['tenant']['id']
s, r = cen.req('/api/central/tenant-admin', {'id': TB, 'login': 'dono'}); B = C(TB); B.req('/api/login', {'role': 'admin', 'login': 'dono', 'password': r['password']}); NB = pw(); B.req('/api/password', {'current': r['password'], 'next': NB})
s, RB = B.req('/api/pdv/resumo'); check(s == 200 and RB['vendas'] == 0 and not RB['turnos'], 'empresa B não vê vendas nem caixas da principal')
s, r = B.req('/api/pdv/faturar', {'id': FV}); check(s == 404, 'empresa B não fatura venda da principal')
s, r = B.req('/api/pdv/autorizar', dict(d10, gerente={'login': AL, 'senha': APW})); check(s in (400, 403), 'gerente da principal não autoriza na empresa B')

print(f'\n{ok} OK, {len(fails)} falha(s)')
if fails: print('\n'.join(' - ' + f for f in fails)); sys.exit(1)

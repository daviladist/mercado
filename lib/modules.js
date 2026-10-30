'use strict';
/*
 * Tino: catálogo de módulos que a Central liga e desliga por empresa.
 * - essential: sempre ligado, não aparece chave na Central.
 * - colls: coleções do módulo. Desligado: o servidor NÃO envia esses dados e recusa gravar neles.
 * - metas: configurações (registros "meta") do módulo, com a mesma regra.
 * - roles: papéis de login que só entram com o módulo ligado.
 * - enforced: 'servidor' = o servidor bloqueia (dados e/ou acesso) e a tela esconde;
 *             'tela' = só esconde a tela (o módulo não tem dados próprios: são visões de outros dados).
 *   Sem enforced: fica registrado na Central e ganha efeito numa próxima etapa.
 */
const MODULES = [
  { code: 'catalogo', group: 'Essenciais', name: 'Catálogo de produtos', desc: 'Produtos, categorias, fotos, EAN e preço de custo', essential: true },
  { code: 'pedidos', group: 'Essenciais', name: 'Pedidos', desc: 'Carrinho, pedido do cliente e do vendedor, status', essential: true },
  { code: 'clientes', group: 'Essenciais', name: 'Clientes', desc: 'CNPJ/CPF, endereço, e-mail da nota', essential: true },
  { code: 'usuarios', group: 'Essenciais', name: 'Usuários e acessos', desc: 'Administrador, vendedor e cliente', essential: true },

  { code: 'comissao', group: 'Comercial e preço', name: 'Comissão de vendedores', desc: 'Percentual por vendedor e pagamento de comissão', enforced: 'servidor', colls: ['commPayouts'] },
  { code: 'tabela_ie', group: 'Comercial e preço', name: 'Tabela com / sem inscrição', desc: 'Preço diferente para cliente com IE ativa e sem IE' },
  { code: 'precos_alt', group: 'Comercial e preço', name: 'Preço à vista e retirada', desc: 'Tabelas extras: à vista e retirada no depósito' },
  { code: 'desconto_qtd', group: 'Comercial e preço', name: 'Desconto por quantidade', desc: 'Preço cai conforme a quantidade' },
  { code: 'ofertas', group: 'Comercial e preço', name: 'Ofertas da semana (vitrine semanal)', desc: 'Ligado: você publica a semana com preços e validade; passou a data final, a vitrine fecha até a nova publicação. Desligado: catálogo fixo (o que está ativo aparece sempre)', enforced: 'servidor', metas: ['lastWeek'] },
  { code: 'negociacao', group: 'Comercial e preço', name: 'Negociação de preço', desc: 'Cliente ou vendedor pede preço especial e o administrador aprova', enforced: 'servidor' },
  { code: 'sabores', group: 'Comercial e preço', name: 'Sabores / variações', desc: 'Um produto com vários sabores ou tamanhos' },

  { code: 'margem', group: 'Margem', name: 'Controle de margem', desc: 'Semáforo de margem no pedido e no produto' },
  { code: 'margem_cat', group: 'Margem', name: 'Margem mínima por categoria', desc: 'Pedido abaixo do mínimo vai para análise' },

  { code: 'entrada', group: 'Operação', name: 'Entrada de mercadoria', desc: 'Fornecedores, receber nota e precificação de notas', enforced: 'servidor', colls: ['receipts', 'imports'] },
  { code: 'conferencia', group: 'Operação', name: 'Separação e conferência', desc: 'Acesso do conferente, leitor de código, itens faltando', enforced: 'servidor', roles: ['conferente'] },
  { code: 'contagem', group: 'Operação', name: 'Contagem de estoque', desc: 'Contagem semanal e ajuste', enforced: 'servidor', colls: ['counts'] },
  { code: 'entregas', group: 'Operação', name: 'Entregas e romaneio', desc: 'Motoristas, rotas, foto do canhoto', enforced: 'servidor', colls: ['romaneios', 'trips'], roles: ['entregador'] },
  { code: 'pdv', group: 'Operação', name: 'Caixa de balcão (PDV)', desc: 'Venda no balcão, pague e leve: leitor de código, pagamentos, abertura e fechamento de caixa', enforced: 'servidor', roles: ['operador_caixa'], defaultOff: true },
  { code: 'pdv_nfce', group: 'Operação', name: 'NFC-e no caixa', desc: 'Nota fiscal do consumidor emitida pelo PDV (fase 2)', defaultOff: true },
  { code: 'ocorrencias', group: 'Operação', name: 'Ocorrências de entrega', desc: 'Recusa, avaria, falta e devolução' },
  { code: 'despesas', group: 'Operação', name: 'Despesas de entrega', desc: 'Combustível, diária, ajudante, pedágio' },

  { code: 'faturamento', group: 'Financeiro', name: 'Faturamento', desc: 'Acesso do faturamento, pedidos para faturar e número da nota', enforced: 'servidor', roles: ['faturamento'] },
  { code: 'receber', group: 'Financeiro', name: 'Contas a receber', desc: 'Prazos, vencidas e pagas', enforced: 'servidor', colls: ['receivables'] },
  { code: 'pagar', group: 'Financeiro', name: 'Contas a pagar', desc: 'Fornecedores e despesas', enforced: 'servidor', colls: ['payables'] },
  { code: 'frete3', group: 'Financeiro', name: 'Frete de terceiro', desc: 'Transportadora com % combinado sobre a nota: marca no pedido, relatório do que deve e pagamentos que abatem', enforced: 'servidor', colls: ['carriers', 'carrierPays'], defaultOff: true },
  { code: 'caixa', group: 'Financeiro', name: 'Caixa da semana', desc: 'Entradas e saídas por forma de pagamento (visão de a receber e a pagar)', enforced: 'tela' },

  { code: 'painel', group: 'Gestão', name: 'Relatórios', desc: 'Vendas por período, ranking, clientes parados', enforced: 'tela' },
  { code: 'decisoes', group: 'Gestão', name: 'Decisões', desc: 'Pendências que esperam o dono', enforced: 'tela' },
  { code: 'staria', group: 'Gestão', name: 'Integração com o ERP (StarIA)', desc: 'Puxar estoque, última compra e custos do ERP', enforced: 'servidor', colls: ['stariaJobs'] }
];
const BY_CODE = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(MODULES.map(m => [m.code, m]))));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const OPTIONAL = MODULES.filter(m => !m.essential).map(m => m.code);

const SEGMENTS = {
  atacado: { name: 'Atacado completo', on: OPTIONAL.filter(c => c !== 'frete3') },
  suplementos: { name: 'Distribuidora de suplementos', on: ['comissao', 'tabela_ie', 'margem', 'sabores', 'painel', 'frete3'] },
  basico: { name: 'Só o básico', on: [] }
};

/* módulos ligados de uma empresa: essencial sempre; o que foi gravado; o resto segue default_on */
function resolve(tenant) {
  const saved = (tenant && tenant.modules) || {};
  const def = !!(tenant && tenant.default_on);
  const out = {};
  // defaultOff: módulo novo que NÃO liga sozinho na empresa principal (o dono decide na Central)
  for (const m of MODULES) out[m.code] = m.essential ? true : (typeof saved[m.code] === 'boolean' ? saved[m.code] : def && !m.defaultOff);
  return out;
}
function presetFor(segment) {
  const s = has(SEGMENTS, segment) ? SEGMENTS[segment] : SEGMENTS.basico;
  return Object.fromEntries(OPTIONAL.map(c => [c, s.on.includes(c)]));
}
/* coleção -> módulo que precisa estar ligado para gravar */
const COLL_MODULE = Object.create(null);
MODULES.forEach(m => (m.colls || []).forEach(c => { COLL_MODULE[c] = m.code; }));
const ROLE_MODULE = Object.create(null);
MODULES.forEach(m => (m.roles || []).forEach(r => { ROLE_MODULE[r] = m.code; }));
const META_MODULE = Object.create(null);
MODULES.forEach(m => (m.metas || []).forEach(k => { META_MODULE[k] = m.code; }));
/* tira do que vai para o navegador os dados dos módulos desligados */
function stripOff(P, mods) {
  for (const m of MODULES) {
    if (m.essential || mods[m.code]) continue;
    (m.colls || []).forEach(c => { if (Array.isArray(P[c])) P[c] = []; });
    (m.metas || []).forEach(k => { delete P[k]; });
  }
  return P;
}
/* gravação de um registro de módulo desligado? (devolve o código do módulo, ou '') */
function blockedBy(ch, mods) {
  if (!ch) return '';
  const need = ch.c === 'meta' ? META_MODULE[ch.id] : COLL_MODULE[ch.c];
  return need && !mods[need] ? need : '';
}

/* chaves (coleções e configurações) dos módulos desligados: o restaurar não mexe nelas e a tela não tenta gravar */
function offKeys(mods) {
  const colls = [], metas = [];
  for (const m of MODULES) { if (m.essential || mods[m.code]) continue; colls.push(...(m.colls || [])); metas.push(...(m.metas || [])); }
  return { keepColls: colls, keepMetas: metas };
}
module.exports = { offKeys, MODULES, BY_CODE, OPTIONAL, SEGMENTS, resolve, presetFor, COLL_MODULE, ROLE_MODULE, META_MODULE, stripOff, blockedBy, has };

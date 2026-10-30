'use strict';
/*
 * Tino: catálogo de módulos que a Central liga e desliga por empresa.
 * - essential: sempre ligado, não aparece chave na Central.
 * - colls: coleções que só podem ser gravadas com o módulo ligado (o servidor recusa).
 * - roles: papéis de login que só entram com o módulo ligado.
 * - enforced: o módulo já tem efeito no app (esconde tela e/ou o servidor recusa).
 *   Os outros ficam registrados na Central e ganham efeito na próxima etapa.
 */
const MODULES = [
  { code: 'catalogo', group: 'Essenciais', name: 'Catálogo de produtos', desc: 'Produtos, categorias, fotos, EAN e preço de custo', essential: true },
  { code: 'pedidos', group: 'Essenciais', name: 'Pedidos', desc: 'Carrinho, pedido do cliente e do vendedor, status', essential: true },
  { code: 'clientes', group: 'Essenciais', name: 'Clientes', desc: 'CNPJ/CPF, endereço, e-mail da nota', essential: true },
  { code: 'usuarios', group: 'Essenciais', name: 'Usuários e acessos', desc: 'Administrador, vendedor e cliente', essential: true },

  { code: 'comissao', group: 'Comercial e preço', name: 'Comissão de vendedores', desc: 'Percentual por vendedor e pagamento de comissão', enforced: true, colls: ['commPayouts'] },
  { code: 'tabela_ie', group: 'Comercial e preço', name: 'Tabela com / sem inscrição', desc: 'Preço diferente para cliente com IE ativa e sem IE' },
  { code: 'precos_alt', group: 'Comercial e preço', name: 'Preço à vista e retirada', desc: 'Tabelas extras: à vista e retirada no depósito' },
  { code: 'desconto_qtd', group: 'Comercial e preço', name: 'Desconto por quantidade', desc: 'Preço cai conforme a quantidade' },
  { code: 'ofertas', group: 'Comercial e preço', name: 'Ofertas da semana', desc: 'Vitrine de ofertas com validade', enforced: true },
  { code: 'negociacao', group: 'Comercial e preço', name: 'Negociação de preço', desc: 'Cliente ou vendedor pede preço especial e o administrador aprova', enforced: true },
  { code: 'sabores', group: 'Comercial e preço', name: 'Sabores / variações', desc: 'Um produto com vários sabores ou tamanhos' },

  { code: 'margem', group: 'Margem', name: 'Controle de margem', desc: 'Semáforo de margem no pedido e no produto' },
  { code: 'margem_cat', group: 'Margem', name: 'Margem mínima por categoria', desc: 'Pedido abaixo do mínimo vai para análise' },

  { code: 'entrada', group: 'Operação', name: 'Entrada de mercadoria', desc: 'Fornecedores, receber nota e precificação de notas', enforced: true, colls: ['receipts', 'imports'] },
  { code: 'conferencia', group: 'Operação', name: 'Separação e conferência', desc: 'Acesso do conferente, leitor de código, itens faltando', enforced: true, roles: ['conferente'] },
  { code: 'contagem', group: 'Operação', name: 'Contagem de estoque', desc: 'Contagem semanal e ajuste', enforced: true, colls: ['counts'] },
  { code: 'entregas', group: 'Operação', name: 'Entregas e romaneio', desc: 'Motoristas, rotas, foto do canhoto', enforced: true, colls: ['romaneios', 'trips'], roles: ['entregador'] },
  { code: 'ocorrencias', group: 'Operação', name: 'Ocorrências de entrega', desc: 'Recusa, avaria, falta e devolução' },
  { code: 'despesas', group: 'Operação', name: 'Despesas de entrega', desc: 'Combustível, diária, ajudante, pedágio' },

  { code: 'faturamento', group: 'Financeiro', name: 'Faturamento', desc: 'Acesso do faturamento, pedidos para faturar e número da nota', enforced: true, roles: ['faturamento'] },
  { code: 'receber', group: 'Financeiro', name: 'Contas a receber', desc: 'Prazos, vencidas e pagas', enforced: true },
  { code: 'pagar', group: 'Financeiro', name: 'Contas a pagar', desc: 'Fornecedores e despesas', enforced: true, colls: ['payables'] },
  { code: 'caixa', group: 'Financeiro', name: 'Caixa da semana', desc: 'Entradas e saídas por forma de pagamento', enforced: true },

  { code: 'painel', group: 'Gestão', name: 'Relatórios', desc: 'Vendas por período, ranking, clientes parados', enforced: true },
  { code: 'decisoes', group: 'Gestão', name: 'Decisões', desc: 'Pendências que esperam o dono', enforced: true },
  { code: 'staria', group: 'Gestão', name: 'Integração com o ERP (StarIA)', desc: 'Puxar estoque, última compra e custos do ERP', enforced: true, colls: ['stariaJobs'] }
];
const BY_CODE = Object.fromEntries(MODULES.map(m => [m.code, m]));
const OPTIONAL = MODULES.filter(m => !m.essential).map(m => m.code);

const SEGMENTS = {
  atacado: { name: 'Atacado completo', on: OPTIONAL },
  suplementos: { name: 'Distribuidora de suplementos', on: ['comissao', 'tabela_ie', 'margem', 'sabores', 'painel'] },
  basico: { name: 'Só o básico', on: [] }
};

/* módulos ligados de uma empresa: essencial sempre; o que foi gravado; o resto segue default_on */
function resolve(tenant) {
  const saved = (tenant && tenant.modules) || {};
  const def = !!(tenant && tenant.default_on);
  const out = {};
  for (const m of MODULES) out[m.code] = m.essential ? true : (typeof saved[m.code] === 'boolean' ? saved[m.code] : def);
  return out;
}
function presetFor(segment) {
  const s = SEGMENTS[segment] || SEGMENTS.basico;
  return Object.fromEntries(OPTIONAL.map(c => [c, s.on.includes(c)]));
}
/* coleção -> módulo que precisa estar ligado para gravar */
const COLL_MODULE = {};
MODULES.forEach(m => (m.colls || []).forEach(c => { COLL_MODULE[c] = m.code; }));
const ROLE_MODULE = {};
MODULES.forEach(m => (m.roles || []).forEach(r => { ROLE_MODULE[r] = m.code; }));

module.exports = { MODULES, BY_CODE, OPTIONAL, SEGMENTS, resolve, presetFor, COLL_MODULE, ROLE_MODULE };

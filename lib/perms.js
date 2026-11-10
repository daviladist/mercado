'use strict';
/*
 * Administradores com acesso limitado (ex.: sócios, gerente).
 * - O administrador SEM "perms" no cadastro é o dono: pode tudo e é o único que cria e muda administradores.
 * - Com "perms": só vê e só grava o que estiver marcado. "editar" desmarcado = só ver, não altera nada.
 * - O servidor é quem garante: o que não está liberado não chega ao aparelho e a gravação é recusada.
 */
const PERMS = [
  { k: 'pedidos', name: 'Pedidos', desc: 'Lançar, editar e mudar a situação dos pedidos; entregas e romaneio' },
  { k: 'clientes', name: 'Clientes', desc: 'Cadastrar e editar clientes' },
  { k: 'produtos', name: 'Produtos e estoque', desc: 'Produtos, preços, categorias, ofertas, contagem, notas de fornecedor e StarIA' },
  { k: 'custos', name: 'Ver custo, margem e lucro', desc: 'Desmarcado: custo, margem e lucro nem chegam ao aparelho dele' },
  { k: 'financeiro', name: 'Financeiro', desc: 'Contas a receber e a pagar, frete de terceiro e caixa da semana' },
  { k: 'comissao', name: 'Comissão de vendedores', desc: 'Ver e fechar a comissão dos vendedores' },
  { k: 'relatorios', name: 'Relatórios e painel', desc: 'Vendas por período, ranking, clientes parados e decisões' },
  { k: 'equipe', name: 'Equipe e senhas', desc: 'Vendedores, conferentes, faturamento, motoristas e operadores; redefinir senha' },
  { k: 'config', name: 'Configurações', desc: 'Loja e regras, formas de pagamento, cidades de entrega' }
];
const KEYS = PERMS.map(p => p.k);
const NAME = Object.fromEntries(PERMS.map(p => [p.k, p.name]));

/* cadastro -> o que precisa estar liberado para gravar ('dono' = só o administrador principal) */
const COLL_PERM = {
  orders: 'pedidos', romaneios: 'pedidos', trips: 'pedidos',
  customers: 'clientes',
  products: 'produtos', categories: 'produtos', combos: 'produtos', counts: 'produtos', receipts: 'produtos',
  imports: 'produtos', suppliers: 'produtos', stariaJobs: 'produtos',
  receivables: 'financeiro', payables: 'financeiro', carriers: 'financeiro', carrierPays: 'financeiro',
  commPayouts: 'comissao',
  sellers: 'equipe', checkers: 'equipe', billers: 'equipe', vehicles: 'equipe', cashiers: 'equipe',
  cities: 'config',
  admins: 'dono'
};
const META_PERM = { lastWeek: 'produtos' };
function permFor(c, id) { return c === 'meta' ? (META_PERM[id] || 'config') : (COLL_PERM[c] || 'config'); }

/* o que vem do cadastro vira um objeto limpo (só chaves conhecidas, só verdadeiro/falso); sem "perms" = dono */
function normalize(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const out = { editar: p.editar === true };
  KEYS.forEach(k => { out[k] = p[k] === true; });
  return out;
}

module.exports = { PERMS, KEYS, NAME, COLL_PERM, permFor, normalize };

'use strict';
/*
 * Abas do topo do painel (ao lado do Caixa) que o dono libera pessoa por pessoa, no cadastro do acesso.
 * Para uma aba nova aparecer como opção no cadastro, basta colocar ela em ABAS: a tela de Acessos monta os
 * quadradinhos a partir desta lista, e quem não estiver liberado não vê a aba nem consegue abrir pela API.
 * O que é do dono continua só dele, mesmo com a aba liberada: o "combinado à parte" da folha, o robô do
 * Telegram e apagar/aprovar despesas no DRE, criar acessos, ajustes e ocorrências do caixa.
 */
const db = require('./pg');

const ABAS = [
  { id: 'folha', nome: 'Folha de pagamento', detalhe: 'vê e lança salários; o combinado à parte continua só seu', papeis: ['financeiro', 'caixista'] },
  { id: 'dre', nome: 'DRE', detalhe: 'vê o resultado do mês e lança despesas; não apaga despesa, não aprova as do robô e não vê o combinado à parte', papeis: ['financeiro'] },
  { id: 'relatorios', nome: 'Relatórios', detalhe: 'painel ao vivo do StarIA (vendas, margem, compras, estoque)', papeis: ['financeiro'] }
];
const IDS = ABAS.map(a => a.id);
const cabe = (aba, papel) => { const a = ABAS.find(x => x.id === aba); return !!a && a.papeis.includes(papel); };

// abas liberadas para a pessoa (o dono tem todas)
async function daPessoa(tid, user) {
  if (user.role === 'admin') return IDS.slice();
  if (!user.ref_id) return [];
  const r = await db.query('select aba from caixa_pessoa_aba where tenant_id=$1 and ref_id=$2', [tid, user.ref_id]);
  return r.rows.map(x => x.aba).filter(a => cabe(a, user.role));
}
async function tem(tid, user, aba) { return (await daPessoa(tid, user)).includes(aba); }

// grava as abas marcadas no cadastro: { folha: true, dre: false, ... }; aba que não veio fica como estava
async function salvar(tid, refId, papel, marcadas) {
  for (const id of IDS) {
    if (typeof marcadas[id] !== 'boolean') continue;
    if (marcadas[id] && cabe(id, papel)) {
      await db.query(`insert into caixa_pessoa_aba(tenant_id,ref_id,aba) values($1,$2,$3) on conflict(tenant_id,ref_id,aba) do update set updated_at=now()`, [tid, refId, id]);
    } else {
      await db.query('delete from caixa_pessoa_aba where tenant_id=$1 and ref_id=$2 and aba=$3', [tid, refId, id]);
      // tabelas antigas (antes desta lista): tirar de lá também, senão a cópia do começo devolveria a liberação
      if (id === 'folha') await db.query('delete from caixa_pessoa_folha where tenant_id=$1 and ref_id=$2', [tid, refId]);
      if (id === 'relatorios') await db.query('delete from caixa_pessoa_rel where tenant_id=$1 and ref_id=$2', [tid, refId]);
    }
  }
}
// abas de todo mundo, para a lista de Acessos do dono
async function deTodos(tid) {
  const r = await db.query('select ref_id, aba from caixa_pessoa_aba where tenant_id=$1', [tid]);
  const m = {}; for (const x of r.rows) (m[x.ref_id] = m[x.ref_id] || []).push(x.aba);
  return m;
}
const catalogo = () => ABAS.map(a => ({ id: a.id, nome: a.nome, detalhe: a.detalhe, papeis: a.papeis.slice() }));

module.exports = { ABAS, IDS, cabe, daPessoa, tem, salvar, deTodos, catalogo };

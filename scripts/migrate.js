'use strict';
/*
 * Migração do protótipo para o servidor (rodar UMA vez, no computador, com a DATABASE_URL da Neon):
 *   DATABASE_URL="postgres://..." node scripts/migrate.js caminho/do/backup.json
 * - cria as tabelas;
 * - importa produtos, clientes, pedidos etc. (fotos vão para a tabela de fotos);
 * - as senhas antigas do arquivo NÃO são aproveitadas (estavam em texto puro e circularam):
 *   cada pessoa recebe senha provisória depois (Cadastros › Configurações › Gerar senhas provisórias);
 * - com --senhas-antigas, as senhas antigas viram hash e exigem troca no 1º acesso (não recomendado).
 * Também dá para fazer tudo pelo próprio app: criar o administrador no primeiro acesso e usar "Restaurar".
 */
const fs = require('fs');
const path = require('path');
const db = require('../lib/pg');
const store = require('../lib/store');
(async () => {
  const file = process.argv[2];
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL.');
  await require('../lib/schema').ensureSchema();
  console.log('Tabelas prontas.');
  if (!file) { console.log('Sem arquivo de backup: só criei as tabelas.'); process.exit(0); }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const S = j && j.app === 'pedidos-atacado' ? j.data : (j.data || j);
  const stats = await store.importBackup(S, { importPasswords: process.argv.includes('--senhas-antigas') });
  console.log('Importado:', stats);
  if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD) {
    const u = await store.setupAdmin(process.env.ADMIN_NAME || process.env.ADMIN_LOGIN, process.env.ADMIN_LOGIN, process.env.ADMIN_PASSWORD).catch(e => { console.log('Administrador:', e.message); return null; });
    if (u) console.log('Administrador criado:', u.login);
  } else console.log('Administrador: crie no primeiro acesso ao app (precisa do SETUP_CODE) ou rode com ADMIN_LOGIN e ADMIN_PASSWORD.');
  process.exit(0);
})().catch(e => { console.error('Falhou:', e.message); process.exit(1); });

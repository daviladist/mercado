'use strict';
/*
 * Tino — cria (ou troca) a senha do super_admin da Central do sistema.
 * Sorteia uma senha forte, mostra UMA vez na tela e grava só o hash scrypt em lib/central-cred.js.
 * Depois de publicar (commit + deploy), todas as sessões antigas da Central caem sozinhas.
 * Uso: node scripts/central-senha.js
 * A senha nunca é gravada em arquivo nenhum: guarde-a num lugar seguro.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../lib/auth');

// sem letras e números que se confundem (0/O, 1/l/I)
const ABC = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
function pick(n) { let s = ''; while (s.length < n) { const b = crypto.randomBytes(1)[0]; if (b < 220) s += ABC[b % 55]; } return s; }
// 5 blocos de 4 = 20 caracteres (~115 bits): fácil de digitar, impossível de adivinhar
function gen() { for (;;) { const p = [pick(4), pick(4), pick(4), pick(4), pick(4)].join('-'); if (/\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p)) return p; } }

(async () => {
  const pass = gen();
  const hash = await hashPassword(pass);
  const file = path.join(__dirname, '..', 'lib', 'central-cred.js');
  fs.writeFileSync(file, `'use strict';
/* Tino — acesso do super_admin da Central do sistema.
   Aqui fica só o HASH scrypt da senha (nunca a senha). Para trocar ou recuperar: node scripts/central-senha.js
   Trocar este hash derruba todas as sessões abertas da Central. */
module.exports = { login: 'super_admin', hash: '${hash}' };
`);
  console.log('Usuário: super_admin');
  console.log('Senha:   ' + pass);
  console.log('(mostrada só agora; publique lib/central-cred.js para valer)');
})();

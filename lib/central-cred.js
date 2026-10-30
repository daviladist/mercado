'use strict';
/* Tino — acesso do super_admin da Central do sistema.
   Aqui fica só o HASH scrypt da senha (nunca a senha). Para trocar ou recuperar: node scripts/central-senha.js
   Trocar este hash derruba todas as sessões abertas da Central. */
module.exports = { login: 'super_admin', hash: 'scrypt$17$8$1$27XesF3IlRUnI+rPPH5iow==$mSgtlGLzCwlyLqV+ymDkeyTEx/+zEEO1xtYwh8rSP6k=' };

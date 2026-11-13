'use strict';
/* Tino — acesso do super_admin da Central do sistema.
   Aqui fica só o HASH scrypt da senha (nunca a senha). Para trocar ou recuperar: node scripts/central-senha.js
   Trocar este hash derruba todas as sessões abertas da Central. */
module.exports = { login: 'super_admin', hash: 'scrypt$17$8$1$wSerDhwCflX+dc1+Yeq0Pg==$zunG/zpFoNsqEeHILhYewBCz+woLYaS+fo5n94aVW6Q=' };

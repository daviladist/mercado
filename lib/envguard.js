'use strict';
/* Na Vercel (produção) as chaves só de teste ficam DESLIGADAS mesmo que alguém as configure por engano:
   cookie sem "Secure", banco sem conferir o certificado e a rota que provoca erro. Avisa no log e segue. */
const ONLY_TEST = ['DEV_INSECURE_COOKIE', 'PG_INSECURE_TLS', 'TINO_TESTE_ERRO'];
function guard(env) {
  if (!env.VERCEL) return [];
  const on = ONLY_TEST.filter(k => env[k] !== undefined);
  on.forEach(k => { delete env[k]; });
  if (on.length) console.error('ATENÇÃO: ' + on.join(', ') + ' só valem em teste e foram ignoradas na Vercel. Tire essas variáveis do projeto.');
  return on;
}
guard(process.env);
module.exports = { guard, ONLY_TEST };

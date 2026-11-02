'use strict';
/* Na Vercel (produção) as chaves só de teste ficam DESLIGADAS mesmo que alguém as configure por engano:
   cookie sem "Secure", banco sem conferir o certificado e a rota que provoca erro. Avisa no log e segue. */
const ONLY_TEST = ['DEV_INSECURE_COOKIE', 'PG_INSECURE_TLS', 'TINO_TESTE_ERRO'];
/* PG_INSECURE_TLS só gera aviso (não é removida): se a produção depender dela hoje, tirar de surpresa derrubaria o banco. */
const WARN_ONLY = ['PG_INSECURE_TLS'];
function guard(env) {
  if (!env.VERCEL) return [];
  const on = ONLY_TEST.filter(k => env[k] !== undefined);
  on.filter(k => !WARN_ONLY.includes(k)).forEach(k => { delete env[k]; });
  if (on.length) console.error('ATENÇÃO: ' + on.join(', ') + ' só valem em teste' + (on.some(k => !WARN_ONLY.includes(k)) ? ' (as de cookie/erro foram ignoradas na Vercel)' : '') + '. Tire essas variáveis do projeto.');
  return on;
}
guard(process.env);
module.exports = { guard, ONLY_TEST };

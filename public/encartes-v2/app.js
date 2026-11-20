// Entrada do app: carrega os dados e troca de tela pelas abas.
import { carregar } from './estado.js';
import { $, $$, avisar } from './telas/comum.js';
import * as campanhas from './telas/campanhas.js';
import * as logos from './telas/logos.js';
import * as modelo from './telas/modelo.js';
import * as loja from './telas/loja.js';
import * as fazer from './telas/fazer.js';
import * as plaquinhas from './telas/plaquinhas.js';

const TELAS = { fazer, plaquinhas, campanhas, loja, logos, modelo };

async function abrir(nome) {
  $$('#abas button').forEach(b => b.classList.toggle('on', b.dataset.tela === nome));
  await TELAS[nome].mostrar($('#tela'));
}

$$('#abas button').forEach(b => b.addEventListener('click', () => abrir(b.dataset.tela)));

for (const f of ['400 20px Anton', '700 20px Oswald', '600 20px Oswald', '700 20px Archivo', '400 20px "Archivo Black"']) await document.fonts.load(f);
try { await carregar(); } catch (e) { avisar('Não consegui abrir os dados: ' + e.message, 6000); }
await abrir(new URLSearchParams(location.search).get('tela') || 'fazer');
window.PRONTO = true;

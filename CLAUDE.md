# Central Tino — regras do projeto

Dono: Eduardo (supermercados D'Ávila e RedeShow Supermercados Express, interior do ES).
Ele não é programador: explique decisões em linguagem simples, sem jargão.

## Regras gerais (valem para qualquer app da Central)

1. **O banco de dados de produtos é intocável.** O banco "StarIA Dávila" (aba Banco de dados
   da Central, cadastro mestre com código interno do StarIA, código de barras, nome, foto e custo)
   é compartilhado entre vários apps: Gerador de Encartes, atacado Dávila e RED Distribuidora.
   - Proibido: mudar estrutura, apagar, migrar, renomear coleção, mudar a API do banco ou rodar
     script de limpeza nele.
   - Os apps só leem o banco pelo caminho que já existe. Eles só gravam o que já gravam hoje (produto
     cadastrado manualmente num app sobe para o banco).
   - Qualquer mudança que encoste no banco: pare e pergunte antes.
2. **Não apague nem sobrescreva dados salvos** (campanhas, encartes, usuários, logos,
   cabeçalhos, configurações, fotos em blob). Se um formato de dado precisar mudar, faça um conversor
   que mantém o original e pergunte antes.
3. **Não faça commit, push nem deploy sem mostrar antes.**
4. **Não crie recurso que o Eduardo não pediu.** Se achar que algo seria bom, pergunte.
5. **Não remende.** Não sobrescreva funções com outra por cima (padrão proibido:
   `const _x2 = x; x = function(){...}`). Se algo está errado, corrija na origem.
6. **Se discordar de um pedido, diga ANTES de fazer**: por que não é bom e qual é a melhor opção.
   Depois deixe o Eduardo decidir.
7. **A régua é a dos melhores do mercado**, não a realidade dele. Ao dar nota baixa a algo,
   corrija até chegar em 8+ e resolva a lista inteira, sem esperar ele pedir item por item.

### Onde está o banco no código (não mexer)
- `lib/banco.js`, `lib/schema.sql`, `lib/schema.js`, `lib/pg.js`, `lib/store.js`, `scripts/migrate.js`
- Testes que provam que ele continua inteiro: `tests/banco.py`, `tests/ci_banco.sh` (rodam no CI,
  `.github/workflows/testes.yml`). Eles têm que continuar passando sem alteração.
- O gerador conversa com o banco SÓ por `lib/encartes.js`, através de `BK.encLer`, `BK.encGravar`
  (documentos `comum/imagens` e `app/catalogo`) e `BK.encFoto`. A reescrita mantém esses mesmos pontos
  de contato, com os mesmos formatos.

## Gerador de Encartes

- No ar: `/t/encarte-davila/`. Código antigo: `public/encartes/app.js` (~547 KB),
  `public/encartes/tino.js`, `public/encartes.html`, `public/encartes/modelos/`. Servidor:
  `lib/encartes.js` (rotas `/api/encartes/*`) e `lib/encartes-voz.js`.
  Testes: `tests/encartes.py`, `tools/encartes_testes.py`.
- **Está sendo reescrito do zero.** O trabalho é feito no ramo `reescrita-encartes`, nunca
  direto no `main`. A Vercel gera um link de prévia do ramo, e é por ele que o Eduardo testa. A versão
  antiga continua no ar até ele aprovar a troca.
- Se existir `ESPEC-ENCARTES.md`, leia antes de mexer no gerador. É ele que diz o que o app faz.
- Não mexa no código antigo, exceto para corrigir algo urgente que ele pedir.

### Vocabulário do Eduardo
- **Tema** = campanha (quinta da carne, quarta imbatível, terça verde, sexta show, sábado de
  ofertas, dia D…).
- **Padrão** = padrões de encarte cadastrados por dia da semana e liberados para o funcionário
  seguir. Não quer dizer consistência visual.

### Estética (prioridade nº 1; a facilidade vem depois)
- Produtos grandes, preços grandes, tela bem preenchida. Frase opcional sobre a foto
  ("tá muito barato", "poucas unidades").
- Nada com cara de feito por IA. Tem que parecer encarte de rede grande de supermercado.
- Cores da marca: vermelho, branco e azul. O fundo, o cabeçalho e o retângulo arredondado sob
  o preço seguem a cor da campanha. O dia D pode usar fundo com tema de fogo.
- Cabeçalho com foto de pessoas fica melhor que um cabeçalho só com letras.
- Logos: D'Ávila e RedeShow Supermercados Express (Itarana-ES). São largas e precisam destacar
  do fundo. Padrão: lado a lado. Deixar sempre um canto livre para as logos (padrão: lateral
  esquerda).
- **A foto do produto fica DENTRO do cartão.** Não pode passar por cima da borda (pode descer um pouco por trás do preço).
- **Centralizado:** nome e preço sempre centralizados no quadro; nome em cima, sem nada por cima dele.
- Não usar "de/por". O formato é preço sem app × preço com app, e o limite de unidades vale no
  preço do app.
- Rodapé com as lojas (Joatuba e Itarana) e a validade da oferta.

### Quem usa
O gerente da loja precisa conseguir colar a lista e baixar sem se perder. Só trava o download
o que mexe com dinheiro (sem preço, preço com app invertido, margem abaixo do mínimo) e a validade.
Foto faltando não trava.

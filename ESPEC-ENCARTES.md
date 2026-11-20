# A IDEIA DO APP (palavras do Eduardo, 20/11/2026) — tudo é medido por aqui

**Qualquer funcionário monta o encarte no padrão do dono, em 3 ou 4 cliques, sem conseguir deixar feio.**
É isso que o QR Ofertas não faz: ele dá opções demais e não trava o padrão, então a equipe faz feio
(logo pequena, sem atenção aos detalhes).

- O dono cadastra **o tema de cada dia da semana** (segunda, terça, quarta, quinta, sexta, sábado) e deixa
  outros temas soltos como campanhas disponíveis da loja.
- Cada tema tem a arte do dono: **cabeçalho vindo do Photoshop**, ou a arte inteira, e o app **distribui os
  itens sozinho no espaço livre** embaixo do cabeçalho, onde couberem. O cabeçalho importado **fica salvo**.
- O funcionário só segue os 4 passos: campanha → cola a lista → confere → baixa. Logo, cores, tamanhos e
  diagramação vêm travados do tema.
- Preço **sem app × com app lado a lado** (o Eduardo achou lindo; é o padrão).
- **Produtos por página** precisam funcionar sem bug (aumentar e diminuir).
- Plaquinhas: caixinha para mostrar ou não o preço por litro/quilo; observações; **data de validade
  diferente por plaquinha** (diferente da data da ação), aparecendo no app quando ela vence; marcar
  produto perto da validade.
- Produto ligado ao banco com a foto certa.

Tudo o que não serve a esta ideia fica para depois.

---

# Gerador de Encartes: levantamento do app atual (Fase 1)

Feito em 20/11/2026, a partir do código que está no ar. **Nada foi alterado no app.**
Este documento é a base da reescrita. Nada é construído antes de o Eduardo aprovar as decisões da seção 6.

---

## 1. Como o app é montado hoje (e por que dá problema)

- **O código de verdade não está neste repositório.** Ele fica num artefato do Claude, o
  "Gerador de Encartes", que tem 29 arquivos `app/01-base.js` … `app/28-correcoes-auditoria.js`, além de
  `app/99-testes.js` e `app/estilo.css`.
- Para publicar, três ferramentas transformam o artefato num arquivo só:
  `tools/artefato_unico.py`, depois `tools/to_tino.py`, e o resultado é `public/encartes/app.js` (~547 KB).
  O próprio arquivo avisa: "não editar à mão".
- **Há duas cópias do mesmo app**, o artefato e o repositório, e o caminho entre elas é manual. Se alguém
  corrige direto no `app.js`, a correção some na próxima publicação. Se alguém corrige no artefato e esquece
  de publicar, o site fica para trás.
- Os arquivos de 18 a 28 são remendos datados ("18 · melhorias (19/11)", "23 · facilidade",
  "28 · correções da auditoria"). Eles trocam funções antigas por novas em cima da hora, com padrões como
  `const _drawCard22 = drawCard; drawCard = function…`, e chegam a "religar" botões que ficaram presos
  à função antiga. É por isso que um conserto quebra coisa em outro lugar.
- Existe também um segundo artefato, o "Gerador de Encartes (visual novo)", de 20/11. Ele não está ligado ao site.

**O servidor está limpo e pequeno** (`lib/encartes.js`, 152 linhas). Ele guarda os documentos, as
imagens e os usuários e controla quem pode o quê. **Não precisa ser reescrito**, só mantido.

## 2. O que o app faz hoje, tela por tela

### Entrada e usuários
- Login por empresa. Há administrador (vê tudo) e funcionário (só o passo a passo; não vê custo).
- O administrador marca o que cada funcionário pode fazer: encarte, plaquinha ou os dois.
- Funciona no celular, com o botão "voltar" do aparelho voltando uma tela.

### Passo a passo (a tela que o gerente usa): 4 passos
1. **Campanha**: escolhe a campanha (tema). A campanha guarda a "receita" do encarte (formato, divisão
   em artes, quantos destaques, QR) e quem pode usá-la.
2. **Cole a lista**: aceita colar de Excel, WhatsApp ou bloco de notas (Ctrl+V em qualquer lugar).
   Entende preço com centavos, unidade (kg, bandeja, dúzia) e fardo ("c/ 12", "cx 24"). Avisa quando
   uma linha ficou sem preço.
3. **Conferir**: mostra a prévia e a lista de produtos, cada um com seus problemas e um conserto.
   - Só **trava o download**: produto sem preço, preço com app invertido, margem abaixo do mínimo,
     validade em branco.
   - O que só merece atenção: foto faltando ou com pouca resolução, nome comprido, preço fora do normal,
     campanha que não combina com os produtos, rodapé sem endereço ou WhatsApp.
   - "Ajustar tudo que dá sozinho": liga o produto ao banco, acha a foto (pelo código, pelo código de
     barras inclusive de caixa DUN-14, ou pelo nome) e arruma o nome.
   - Por produto: foto do computador, foto da internet, ligar ao banco, tamanho e posição do nome,
     pôr em destaque, ajuste fino (frase, zoom, limite) e excluir.
   - Frente e verso: o app divide sozinho. O verso pode ter cabeçalho completo, faixa fina, nenhum ou rodapé.
   - Artes "travadas" com cadeado: os produtos daquela arte não mudam de lugar.
4. **Baixar**: encarte para WhatsApp e Instagram (1080×1350), story (com área segura do Instagram),
   A4 para imprimir, tudo em .zip, compartilhar no WhatsApp, plaquinhas e TV.

### Arte do encarte (o desenho)
- A diagramação é automática, com uma hierarquia de "peso" para cada produto: ícone, destaque, normal
  e complemento. As linhas de cima têm menos cartões (maiores) e as de baixo têm mais.
- Cartão em pé (foto, nome, preço) ou deitado (foto à esquerda), conforme o espaço.
- Bloco de preço "sem app × com app", com limite de unidades no preço do app. O número do preço sai
  do mesmo tamanho em cartões do mesmo tamanho.
- Preço por kg ou litro calculado da descrição (exigência legal).
- Frase de impacto por produto, com tamanho e posição.
- Cabeçalho: título que se ajusta (1 a 3 linhas), cores da campanha, foto dentro do cabeçalho com o canto
  esquerdo livre para as logos, ou **cabeçalho pronto em imagem** (feito no Photoshop), do qual o app tira
  as cores.
- Logos fixas (D'Ávila e RedeShow), com contorno automático para destacar do fundo. O dono arrasta e
  redimensiona, e a posição fica salva por campanha e formato.
- Fundos desenhados pelo próprio app (madeira, lousa, kraft, cimento, fogo…) e desenhos decorativos do tema.
- Fotos: recorte automático do fundo branco, limpeza do "xadrez" de foto falsamente transparente e um
  desenho do setor quando o produto não tem foto.
- Modo "economia de tinta" (cabeçalho e preço brancos com contorno preto).
- Rodapé com lojas, validade e observações.

### Outras ferramentas
- **Plaquinhas de gôndola**: 1 ou 2 por folha, em pé ou deitada, mais tamanhos A3, A4, A5, A6 e etiqueta.
  Plaquinha avulsa lendo o código de barras pela câmera. Registro das plaquinhas impressas.
- **TV da loja**: vídeo 1920×1080, um produto por vez. A TV abre o app uma vez e se atualiza sozinha.
- **Vídeo com voz** (ElevenLabs) para story e feed, com controle de créditos e de música de fundo.
- **StarIA**: conferência de preço e custo, ofertas sugeridas, quanto a oferta custa em desconto e
  conferência gôndola × sistema. No Tino o site não fala com o StarIA: grava um pedido e o Claude atende (código 1313).
- **Arte própria do Photoshop**: baixa um kit PSD, sobe a arte pronta e marca as vagas dos produtos.
- Campanhas padrão por dia da semana, repetir a última campanha, kit da semana, resultado da campanha.
- Banco de fotos: 155 fotos que já vêm com o app e uma biblioteca de fotos do próprio mercado.

## 3. Onde os dados ficam (a reescrita lê exatamente estes)

| Endereço | O que é | Quem grava |
|---|---|---|
| `app/estado` | configuração, campanhas | admin |
| `app/catalogo` | **banco de produtos** (código, EAN, nome, preço, preço mínimo) | admin, passa pelo banco da Central |
| `app/custos` | custo e imposto | admin (só ele lê) |
| `app/usuarios`, `app/acessos` | usuários e permissões | admin |
| `app/vozcfg`, `app/vozuso` | limite e uso de créditos da voz | servidor |
| `comum/imagens` | fotos e nomes que todo mundo soma (**ligado ao banco da Central**) | todos |
| `comum/*` | histórico, plaquinhas, TV, pedidos ao StarIA | todos |
| `salvos/*` | encartes salvos (sem custo) | todos |
| `data/users/<id>/rascunho` | encarte em edição de cada pessoa | a própria pessoa |
| blobs (`/api/encartes/blob`) | imagens | todos |

O banco de produtos da Central entra **somente** por `lib/encartes.js` (`BK.encLer`, `BK.encGravar`,
`BK.encFoto`) nos documentos `comum/imagens` e `app/catalogo`. **A reescrita não muda nada disso.**

## 4. Problemas encontrados

1. **A foto passa por cima da borda do cartão** (arquivo 22). Foi colocada de propósito, sem botão
   para desligar. O Eduardo não quer isso.
2. **Importar cabeçalho próprio** não está funcionando bem, segundo o Eduardo. A causa ainda não foi
   testada. Vai ser verificada na construção.
3. **Prévia do passo 3** abre já rolada para baixo, escondendo os controles de frente e verso.
4. **Duas cópias do código** (artefato e repositório), com publicação manual.
5. **Remendos em camadas** (arquivos 18 a 28) e botões religados à força.
6. **O app tem "de/por"** (preço riscado), mas o Eduardo não trabalha com isso.
7. **O repositório `daviladist/mercado` é público**: qualquer pessoa vê o código de todos os apps.
   Nenhuma senha foi encontrada no código, mas o certo é deixá-lo privado.

## 5. Proposta para a reescrita

- **Uma cópia só**: o código novo mora no repositório, em arquivos separados por assunto (desenho,
  lista, conferência, downloads, plaquinhas, TV, voz, nuvem). Acaba o artefato → bundle → publicação manual.
- **Mesma nuvem, mesmos dados**: o servidor (`lib/encartes.js`) e os endereços da seção 3 ficam iguais.
  O app novo abre os rascunhos, campanhas e fotos que já existem.
- **Rota de teste**: `/t/<empresa>/encartes-novo`, ou o link de prévia da Vercel, até o Eduardo aprovar.
- **Ordem**: 1) desenho da arte (o que mais importa); 2) lista e conferência; 3) downloads; 4) plaquinhas;
  5) TV e vídeo; 6) o resto que for aprovado na seção 6.
- **Testes**: os testes atuais do servidor e do banco continuam passando sem alteração. As regras de
  negócio do `99-testes.js` viram testes do app novo.

## 6. Decisões do Eduardo (20/11/2026)

**SAI:** foto por cima da borda do cartão (a), preço "de/por" riscado (b), estilo vitrine (c),
fundos desenhados pelo app — madeira, lousa, kraft, cimento (e), desenhos decorativos do tema (f).
O fundo com tema de fogo (dia D) é pedido do Eduardo e **fica**.

**SAI também (20/11, 15h41):** importar a arte inteira do Photoshop com vagas marcadas (g). Do Photoshop entra **só o cabeçalho**; os produtos o app distribui sozinho.

**FICA:** foto repetida em cascata (d), vídeo com voz (h), TV da loja (i),
plaquinha pela câmera (j), ofertas sugeridas / kit da semana / resultado / custo da oferta (k),
economia de tinta (l), story com área segura (m), recorte do fundo branco da foto (n).

**Repositório público → privado (o):** quem muda é o Eduardo, no GitHub, conferindo antes se a Vercel
continua publicando.


## 6b. Decisões sobre campanhas (20/11/2026, 15h50)

- **Validade:** automática pela campanha (campanha de um dia = a próxima data desse dia; todos os dias = hoje);
  o funcionário pode mudar.
- **SAI:** liberar campanha por funcionário (todo funcionário vê as campanhas do dia);
  checagem "campanha não combina com os produtos".
- **QR code:** fica, só para **baixar o app da loja** (o preço forte é "com app"). Link cadastrado pelo dono.
- **Formatos:** Feed 1080×1350, Story 1080×1920 e A4. **TV fica para depois.**
- **Frases do produto:** lista fixa cadastrada pelo dono; o funcionário só escolhe dela.
- **Rodapé:** validade + nomes das lojas + observação fixa + WhatsApp/endereço + faixa de bandeiras de cartão
  (imagem que o dono sobe) + uma observação pontual daquele encarte (uma linha, opcional).
- **Extras agora:** só "Duplicar campanha". Repetir última lista, ofertas sugeridas pelo StarIA, resultado da
  campanha, kit da semana, TV e vídeo com voz: **depois** que o básico estiver rodando na loja.


## 6c. Decisões sobre os itens do encarte (20/11/2026, 16h05)

- **Lista:** uma linha por produto: `Nome  preço` ou `Nome  preço  preço-app` (o 2º preço é o do app).
  O limite o funcionário marca depois, no produto.
- **Foto:** o app acha sozinho no banco (código, código de barras, nome). Se não achar: foto do aparelho
  (câmera ou arquivo) **ou da internet** (abre a busca de imagens e a pessoa cola a imagem). A foto nova sobe para o banco.
- **Ajustes manuais por produto (zoom, letra, posição do nome, mover frase): SAEM.** O funcionário só mexe em:
  destaque (até o máximo do modelo), frase (da lista do dono), limite, ordem e excluir.
- **Nome no encarte:** o que o funcionário colou, com acento e maiúsculas arrumados pelo app.
  O banco só serve para achar foto e conferir preço.
- Sem resposta do Eduardo, ficou a sugestão do Claude: cascata automática pelo nome (kit, fardo, combo, "c/ 12",
  "leve 3") com liga/desliga no produto; preço por kg/L só na plaquinha; produto sem banco entra com aviso
  (não trava); adicionar produto colando a lista ou digitando um por um (câmera só nas plaquinhas).

## 7. Arquitetura proposta (Fase 2)

### Onde fica
- `public/encartes-v2/` — o app novo, em arquivos pequenos, um por assunto. O navegador carrega os
  arquivos direto, sem etapa de "juntar" (acaba o artefato → bundle).
- `public/encartes.html` só troca de app quando o Eduardo aprovar. Até lá, o app novo abre por
  `/t/<empresa>/?v2=1` (o servidor escolhe a página) e pelo link de prévia da Vercel.
- `lib/encartes.js` (servidor) **não muda**.

### Arquivos
| Arquivo | Faz o quê |
|---|---|
| `estado.js` | os dados do encarte em edição, num lugar só; toda tela lê daqui |
| `nuvem.js` | conversa com `/api/encartes/*` (mesmos endereços de hoje) |
| `lista.js` | entende a lista colada (preço, unidade, fardo, linha sem preço) |
| `banco.js` | liga produto ao banco (código, EAN, DUN-14, nome) e acha foto — **só leitura e as mesmas gravações de hoje** |
| `conferir.js` | o que trava e o que só avisa; "ajustar tudo sozinho" |
| `arte/diagrama.js` | onde cada produto fica (peso, linhas, frente e verso, cadeado) |
| `arte/cartao.js` | o cartão: foto **dentro**, nome, bloco sem app × com app |
| `arte/cabecalho.js` | título, cores, foto no cabeçalho, cabeçalho pronto em imagem, logos |
| `arte/fundo.js` | cor da campanha, luz, tema de fogo |
| `arte/rodape.js` | lojas, validade, observações |
| `fotos.js` | carregar, recortar fundo branco, limpar xadrez |
| `baixar.js` | 1080×1350, story, A4, zip, compartilhar |
| `plaquinhas.js`, `tv.js`, `voz.js`, `photoshop.js`, `staria.js`, `extras.js` | cada ferramenta no seu arquivo |
| `telas/*.js` | as telas: entrada, passo a passo (4 passos), painel do admin |
| `testes/` | as regras de negócio viram testes que rodam sozinhos |

Regra: nenhum arquivo troca função de outro. Se algo está errado, corrige no arquivo dono do assunto.

### Segurança dos dados durante o teste
- O link de prévia usa **a mesma nuvem de verdade**. Para não estragar nada enquanto testa:
  - o rascunho do app novo fica em `data/users/<id>/rascunho-v2` (o de hoje não é tocado);
  - campanhas, configuração, usuários e banco são **só lidos** pelo app novo até a troca;
  - fotos novas sobem do mesmo jeito que hoje (é o que já acontece).
- Na troca, o app novo passa a gravar nos endereços normais, no mesmo formato.

### Ordem de construção (cada etapa mostrada antes da próxima)
1. Arte do encarte (cartão, cabeçalho, fundo, rodapé, diagrama) com um encarte real.
2. Passo a passo: campanha → colar lista → conferir → baixar.
3. Plaquinhas.
4. TV, vídeo com voz, Photoshop, StarIA e extras.
5. Comparação lado a lado com o app atual e troca.

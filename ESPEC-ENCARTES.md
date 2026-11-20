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

## 6. Decisões do Eduardo (antes de construir)

Marque **FICA**, **SAI** ou **DEPOIS**:

| # | Recurso | Por que perguntar |
|---|---|---|
| a | Foto passando por cima da borda do cartão | Você reclamou. Proposta: **SAI** |
| b | Preço "de/por" (riscado) | Você usa sem app × com app. Proposta: **SAI** |
| c | Estilo "vitrine" (produto solto no fundo, sem cartão) | Visual diferente do seu padrão |
| d | Foto repetida em cascata ("leve vários") | Recurso automático, pode confundir |
| e | Fundos desenhados (madeira, lousa, kraft, cimento) | Você quer cara de encarte real, não de IA |
| f | Desenhos decorativos do tema no fundo | Mesmo motivo |
| g | Arte própria do Photoshop (kit PSD, vagas marcadas) | Pesa quase 1 MB a mais no app |
| h | Vídeo com voz (ElevenLabs) | Gasta crédito; é usado? |
| i | TV da loja | É usada hoje? |
| j | Plaquinha avulsa pela câmera (bipar código) | É usada hoje? |
| k | Ofertas sugeridas pelo StarIA, kit da semana, resultado da campanha, custo da oferta | É usado? |
| l | Modo "economia de tinta" | É usado? |
| m | Story com área segura do Instagram | Proposta: **FICA** |
| n | Recorte automático do fundo branco da foto | Proposta: **FICA** |
| o | Repositório público → privado | Proposta: **deixar privado** |

Depois das respostas, vem a Fase 2 (arquitetura) e a construção começa pela arte.

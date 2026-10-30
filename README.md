# D'Ávila Pedidos

App de pedidos de atacado do ATACADO D'ÁVILA. Seis acessos: cliente, administrador, vendedor, conferente, faturamento e entregador.

**Versão 2 (com servidor).** Login, senhas e dados ficam no servidor. Cada navegador recebe só o que a pessoa logada pode ver.

## Como está organizado

| Pasta | O que tem |
|---|---|
| `public/index.html`, `public/cliente.html`, `public/app.js` | O app (a tela), equipe e só-clientes. **Não tem nenhum dado nem senha.** Gerados por `scripts/build-app.js`; o código fica em `app.js` porque a CSP proíbe script dentro da página. |
| `api/index.js` | Única função da Vercel; todas as rotas `/api/*` chegam aqui. |
| `lib/pg.js` | Cliente do Postgres (TLS + SCRAM), sem dependências. |
| `lib/auth.js` | Senhas com hash **scrypt** (N=2^17, r=8, p=1), sessões e bloqueio por tentativas. |
| `lib/policy.js` | **Quem vê o quê e quem pode mudar o quê.** Filtra antes de enviar e confere tudo que chega. |
| `lib/store.js` | Banco: registros, fotos, usuários, importação de backup, senhas provisórias. |
| `lib/core.generated.js` | As mesmas regras de preço/margem/comissão do app, copiadas por `scripts/build-core.js` para o servidor recalcular tudo. |
| `src/app.source.html` | Código original do app (onde se mexe nas telas). |
| `src/server-client.js` | Parte do app que conversa com o servidor (login, sincronização). |
| `tests/unit/` | Testes de unidade das regras do servidor, com dados fictícios (`npm test`, também no GitHub Actions). |
| `tests/*.py` | Testes pela API e pela tela, num banco de teste: segurança, os itens da banca de revisão (`banca_api.py`) e o fluxo completo pedido → entrega. Saem com código 1 quando algo falha. |

Não há pacotes npm para instalar: tudo usa só o Node 20+.

## Entrada de mercadoria (notas de fornecedor)

- **Cadastros › Fornecedores:** código, nome, CNPJ, telefone, contato.
- **Receber mercadoria** (conferente, aba própria; administrador em Produtos): fornecedor por código ou nome, número da nota, produtos bipados ou digitados, com **quantidade** (embalagens) e **valor unitário da nota**. Ao tocar em **Conferido**, o estoque soma na hora (no servidor, sem atropelar vendas ao mesmo tempo).
- **Precificação de notas** (administrador em Produtos; faturamento em "Precificar notas"): por linha, quantidade, fardo com quantas unidades, valor unitário, **tributado** e **preço com IE**, com margem/markup ao lado (tributado: ICMS de saída 17% sem IE ou 7% com IE + PIS/COFINS 9,25%, conforme Configurações). Ao **aprovar**, custo, embalagem, tributação e preços vão para os produtos. Enquanto houver nota sem aprovação, um aviso fica fixo no painel.
- Não é integração fiscal: as notas continuam sendo lançadas também no ERP.

## Segurança: o que mudou

- **Login no servidor.** O navegador manda usuário e senha; o servidor confere contra o hash e devolve um cookie `HttpOnly`, `Secure` e `SameSite=Strict`. O navegador nunca recebe senha de ninguém.
- **Senhas com hash scrypt** (resistente a força bruta, recomendado pela OWASP). No banco fica só o hash; da sessão fica só o SHA-256 do token.
- **Bloqueio de senha errada:** 5 erros seguidos bloqueiam aquela pessoa **naquele aparelho/IP** por 15 minutos (ninguém de fora tranca o dono). 60 erros somando todos os IPs, ou 30 de um mesmo IP, também bloqueiam. "Redefinir senha" pela loja destrava.
- **Trocar a senha derruba as outras sessões** (quem roubou uma sessão perde o acesso).
- **Senha provisória** é obrigatoriamente trocada no primeiro acesso: mínimo de 8 caracteres, e 10 para o administrador.
- **Cada papel recebe só a sua parte:**
  - Custo, margem, regras de negociação, impostos e senhas só chegam ao administrador.
  - O cliente vê o próprio cadastro, os próprios pedidos e as próprias contas.
  - O vendedor vê os clientes e pedidos dele e a própria comissão, mas não vê custo nem margem.
  - O conferente não recebe preço nenhum.
  - O entregador vê só os pedidos dele.
- **O servidor confere toda gravação:**
  - O preço do pedido é recalculado com as regras do app.
  - A trava de margem do vendedor e o aceite da negociação são calculados no servidor.
  - Situação e faturamento seguem a ordem certa: sem nota, o pedido não sai.
  - Ninguém mexe em pedido de outra pessoa.
- **Nada de dado da loja guardado no aparelho:** o app apaga a cópia antiga do protótipo. Ficam no aparelho só o rascunho da própria pessoa (carrinho, pedido em andamento, formulário de entrega) e o que ainda não foi enviado por falta de internet, até o servidor confirmar.
- **Sem internet:** nada é dado como gravado sem resposta do servidor. Uma faixa vermelha mostra quantas alterações faltam enviar; o app reenvia sozinho quando a conexão volta.
- **Alteração recusada pelo servidor** aparece num aviso que fica na tela até a pessoa fechar, e só aquela alteração volta atrás (as outras seguem).
- **Etapas e dinheiro no servidor:** itens só mudam com o pedido em "novo" (fora a loja); falta e troca da separação, ocorrência na entrega, contas "não pagou"/"produto a mais", estoque e parcelas automáticas são calculados pelo servidor. Pedido em análise, contraproposta ou recusado não anda.
- **Outras proteções:** proteção contra envio de outro site (CSRF), cabeçalhos de segurança (CSP, HSTS, X-Frame-Options) e site fora do Google.

## Colocar no ar (Vercel + Neon)

1. **Banco:** no painel da Vercel, abra o projeto e vá em **Storage › Create Database › Neon (Postgres)**. Conecte ao projeto. A Vercel cria a variável `DATABASE_URL` sozinha.
2. **Código de instalação:** em **Settings › Environment Variables**, crie `SETUP_CODE` com um código longo e só seu (mínimo 12 caracteres). Ele só serve para criar o primeiro administrador.
3. **Publicar:** importe este repositório na Vercel (ou faça *Redeploy*). Não precisa de build: a Vercel publica `public/` e a função `api/`.
4. **Criar o administrador:** abra `https://SEU-SITE/#admin`, informe o código de instalação, seu usuário e uma senha forte. As tabelas são criadas sozinhas no primeiro acesso.
5. **Trazer os dados do protótipo:** em **Cadastros › Configurações › Loja e regras**, use **Restaurar de um arquivo** com o backup `.json`.
   - As senhas antigas do arquivo **não são aproveitadas**. Elas estavam em texto puro e circularam.
6. **Senhas provisórias:** na mesma tela, clique em **Gerar senhas provisórias**.
   - Aparece uma lista com usuário e senha de cada pessoa. Ela só aparece **uma vez**: imprima.
   - Cada pessoa troca a senha no primeiro acesso.
   - Vendedor e motorista precisam ter usuário cadastrado antes.
7. **Endereços para cada pessoa:**
   - Cliente: `https://SEU-SITE/`
   - Equipe: `/#admin`, `/#vendedor`, `/#conferente`, `/#faturamento`, `/#entregador`

Alternativa pelo terminal (no lugar dos passos 4 a 6):
```
DATABASE_URL="postgres://...neon..." ADMIN_LOGIN=eduardo ADMIN_PASSWORD='...' node scripts/migrate.js backup.json
```

## Tino — Central do sistema e várias empresas

Este app é a base do **Tino** (*Quem tem Tino, vende melhor.*). Vários negócios usam o mesmo sistema e o mesmo banco, cada um vendo só os próprios dados.

### Endereços
- Empresa principal (D'Ávila): `https://SEU-SITE/` (equipe em `/#admin` etc.), como sempre.
- Outras empresas: `https://SEU-SITE/t/<empresa>/#admin` (equipe) e `https://SEU-SITE/t/<empresa>/cliente` (clientes).
- Central do sistema (só o dono do sistema): `https://SEU-SITE/central`, usuário `super_admin`.

### Como os dados ficam separados
- Toda linha de `users`, `docs` e `photos` tem `tenant_id` (sem valor padrão: quem grava é obrigado a dizer a empresa) ligado a `tenants`.
- O navegador manda a empresa no cabeçalho `X-Tenant` (`@` = principal). A sessão pertence a UMA empresa: aberta no endereço de outra, vale como não logado. Sem cabeçalho (foto num `<img>`), vale a empresa da sessão.
- Número do pedido por empresa (`order_seq`), nunca repetido. Rascunhos e alterações sem internet guardados no aparelho também levam a empresa.

### Central
- Cadastra empresas (nome, logo, cor, modelo por segmento), liga/desliga módulos e cria o **acesso principal do administrador** de cada empresa (senha provisória mostrada uma vez; gerar de novo, mesmo com outro usuário, substitui o anterior e derruba as sessões dele).
- Situação: **ativa**; **em preparo** (só o administrador entra, para cadastrar tudo); **suspensa** (ninguém entra; quem estiver com o app aberto é avisado e sai). A principal não pode ser suspensa.
- Módulos: os marcados como servidor não enviam os dados nem aceitam gravação quando desligados (e tiram o login de conferente, entregador ou faturamento); Caixa, Relatórios e Decisões só escondem a tela (são visões de outros dados); os marcados "efeito na próxima etapa" ficam só registrados.

### Segurança da Central
- Login separado da loja: outro cookie (`__Host-csid`, HttpOnly, Secure, SameSite=Strict), outra tabela de sessões, 8 h.
- Senha do `super_admin`: só o **hash** scrypt. Vem da variável **`CENTRAL_HASH`** da Vercel, se existir (recomendado); senão, de `lib/central-cred.js`.
- 5 tentativas por IP a cada 15 min, contadas antes de conferir a senha (tentativas em paralelo não furam o limite). Sem bloqueio geral, para ninguém trancar o dono do lado de fora.

### Perdeu a senha do super_admin
Não existe "recuperar": a senha não fica guardada. Gere outra com `node scripts/central-senha.js` (mostra a senha uma vez e grava o hash em `lib/central-cred.js`; para usar a variável, copie o hash para `CENTRAL_HASH` na Vercel) e publique. As sessões antigas da Central caem.

### Atualização do banco (importante)
- `lib/schema.sql` é aplicado sozinho, **numa transação só e com trava**, e só quando o arquivo muda (a impressão digital fica em `schema_version`).
- A conversão para várias empresas **não tem volta automática**: depois de publicada, **não use "Instant Rollback"/"Promote" de uma versão anterior na Vercel** (a versão antiga não entende `tenant_id`: gravaria com erro e misturaria empresas). Para desfazer algo, publique uma correção para frente. Publique fora do horário de uso.

### Testes
- `npm test` (regras, sem banco) e `PGURL=postgres://usuario:senha@host:porta bash tests/ci_banco.sh` (Central e separação por empresa com Postgres de teste; também roda no GitHub).

## Caixa de balcão (PDV) — módulo "pdv"

Venda no balcão ("pague e leve") no mesmo sistema e no mesmo banco, separada por empresa.

- **Ligar:** Central do sistema › empresa › módulo "Caixa de balcão (PDV)" (começa desligado). Desligado, o operador de caixa não entra e a API do caixa responde 403.
- **Quem usa:** perfil **operador de caixa** (Cadastros › Usuários › Operadores de caixa). Vende e recebe; **nunca** recebe custo, margem nem estoque. O administrador também pode operar.
- **Endereço:** `https://SEU-SITE/pdv` (outras empresas: `/t/<empresa>/pdv`). No painel: aba **Caixa (PDV)**.
- **Tela (teclado):** campo do código sempre com foco (leitor USB = teclado + Enter); `4*código` = 4 unidades; F2 busca por nome, F3 quantidade, F4 cliente (preço com IE, se o cliente tiver), F6 desconto, F7 cancela item com motivo, F8 reimprime, F9 consulta preço, F10 pagamento, F11 (ou Ctrl+E) venda em espera, F12 (ou Ctrl+K) caixa. Esc fecha janelas. Som de ok/erro. Código não cadastrado: aviso, e o gerente pode vincular o código a um produto.
- **Pagamento:** misto (dinheiro, PIX, débito, crédito, fiado), troco automático (só sai do dinheiro), PIX com QR/"copia e cola" no valor exato e botão "Conferi o PIX", cartão só registra, fiado só para cliente com limite (gera conta a receber).
- **Servidor confere tudo:** recalcula preço, desconto e margem; venda com valor diferente do servidor é recusada; desconto acima do limite (ou abaixo da margem mínima) só com senha de um administrador, gravando quem autorizou (autorização vale uma vez, para aquela venda, por 10 minutos); a mesma venda enviada duas vezes grava uma vez; venda, itens, pagamentos, estoque e fiado entram juntos ou nada entra; tudo auditado.
- **Preço no balcão:** o mesmo cálculo do app para *retirada*, sem forma de pagamento escolhida (a regra "à vista" e o desconto de retirada do app não valem no balcão), com o preço de IE para cliente com IE ativa. Desconto do caixa: até o limite configurado sem gerente; acima disso, senha do gerente, que é avisado quando a margem fica abaixo da mínima (o caixa nunca recebe essa informação, para não deduzir o custo).
- **Fiado:** mesma regra de crédito do app (conta vencida bloqueia; pedidos a prazo em aberto contam no limite), conferida dentro da transação com o cliente travado.
- **Sem internet:** o caixa abre e vende com o catálogo guardado no aparelho (até 3 dias; sem custo, margem nem estoque). Venda que chegar diferente do servidor (preço, desconto sem gerente, fiado fora da regra, produto removido) **não vira venda**: fica em "vendas com problema" no painel: o gerente confere e **lança como venda** (pelo valor cobrado no balcão; a diferença vira desconto autorizado por ele; o estoque baixa e o dinheiro entra no caixa da venda) ou resolve com uma anotação. Marcar uma venda como "sem internet" não afrouxa nenhuma regra.
- **Cancelar venda:** só o administrador, com motivo; devolve o estoque e apaga o fiado ainda não pago (venda que já virou pedido da NF-e é cancelada pelo pedido).
- **Caixa:** abertura com fundo de troco; sangria/suprimento com senha do gerente; fechamento **às cegas** (o operador informa o que contou sem ver o esperado); diferença **por forma de pagamento** (falta no PIX não some com sobra no dinheiro) vira aviso no painel até ser justificada; relatório do turno.
- **Sem internet:** a venda vai para uma fila no aparelho e é enviada sozinha. Se o valor não bater quando chegar, ela entra "a revisar" (já foi paga) para o gerente conferir.
- **Integrações:** painel com o balcão separado (vendas, margem, avisos); Financeiro › Caixa da semana mostra o balcão por dia e por forma; botão **Enviar para faturamento** transforma a venda (com cliente) em pedido "A faturar" para a NF-e, sem baixar estoque de novo nem gerar outra conta. Comprovante 80 mm pelo navegador (não fiscal).
- **NFC-e:** fase 2 (módulo "NFC-e no caixa", já registrado; a venda tem os campos `nfce_status`/`nfce_chave` reservados).
- **Tabelas:** `caixas`, `pdv_vendas`, `pdv_itens` (custo e preço do momento), `pdv_pagamentos`, `caixa_movimentos`, `pdv_autorizacoes`, `pdv_seq` — todas com `tenant_id` (a empresa).
- **Testes:** `tests/pdv.py` (108 verificações; roda no `tests/ci_banco.sh` e no GitHub).

## Vitrine semanal x catálogo fixo (e o que o PDV vende)
O **cadastro** (produtos com estoque) e a **vitrine** (o que cliente e vendedores veem no app) são coisas diferentes:
- **Vitrine semanal** = módulo "Ofertas da semana" ligado na Central (D'Ávila). Você publica a semana em OFERTAS › Ofertas da semana (marca produtos, preços e validade). **Passou o dia final** (horário de Brasília), a vitrine fecha com "Nova tabela em breve": o servidor recusa pedido de cliente e de vendedor até você publicar de novo. A loja (administrador) continua lançando pedido.
- **Catálogo fixo** = módulo desligado (pacote "Distribuidora de suplementos"). Não existe semana: tudo o que está ativo aparece sempre; você ativa e desativa produto pelo cadastro.
- **Produto com estoque zerado** (CADASTROS › Configurações › Loja e regras): continua aparecendo (padrão) / some da vitrine e volta quando entrar estoque / aparece como "Esgotado" sem poder pedir. Produto com estoque em branco não é afetado. O servidor aplica a mesma regra nos pedidos.
- **PDV vende todo o cadastro**, esteja ou não na oferta da semana, menos o produto marcado em **Bloquear venda no caixa (PDV)** (no cadastro do produto; sempre desmarcado de início).
- Testes: `tests/vitrine.py`.

## Frete de terceiro — módulo "frete3"
Para quem paga uma transportadora por entrega, com um % combinado sobre o valor da nota. Começa **desligado** (na D'Ávila e no pacote "Atacado completo"); vem ligado no pacote "Distribuidora de suplementos". Liga e desliga na Central.
- **Cadastro:** CADASTROS › Fornecedores › Transportadoras (nome e % combinado).
- **No pedido:** ao lançar/editar pelo painel, ou no cartão do pedido em PEDIDOS, marcar **Frete terceiro**: a transportadora e o % vêm sozinhos (dá para ajustar o % daquele pedido). O valor é sempre % × total do pedido; pedido cancelado não gera frete. O lucro estimado do pedido já desconta o frete.
- **Relatório e pagamentos:** FINANCEIRO › Frete de terceiro: frete gerado, já pago e saldo a pagar por transportadora; lista por período com Excel; "Registrar pagamento" (data, valor, observação) abate do saldo.
- **Segurança:** só o administrador vê. O servidor esconde frete, transportadoras e pagamentos dos outros papéis, guarda o % e o nome vindos do cadastro e preserva o frete quando o vendedor mexe no pedido. Testes: `tests/frete.py`.

## Desenvolver e testar no computador

```
# Postgres local, depois:
export DATABASE_URL="postgres://usuario:senha@127.0.0.1:5432/davila?sslmode=require" PG_INSECURE_TLS=1 DEV_INSECURE_COOKIE=1
node scripts/build-core.js   # só se mudar regra de preço no src/app.source.html (precisa do TypeScript instalado)
node scripts/build-app.js    # gera public/index.html a partir de src/
node scripts/dev-server.js   # http://localhost:3000
```
- Testes de unidade (sem banco): `npm test`.
- Testes pela API e pela tela (Python + Playwright, banco de TESTE): `tests/e2e_setup.py` (cria os acessos e sorteia senhas de teste em `$OUT/creds.json`), depois `tests/security.py`, `tests/banca_api.py` e `tests/e2e_flow.py`. Nenhuma senha de teste fica escrita no repositório.
- `scripts/build-app.js` para se alguma troca não casar com o código-fonte (o número de trocas é conferido).
- `PG_INSECURE_TLS=1` e `DEV_INSECURE_COOKIE=1` são só para teste local. **Nunca configure essas duas na Vercel.**

## Regras deste repositório

- Repositório **privado**.
- **Nunca** colocar aqui backups (`.json`), planilhas ou PDFs com dados de clientes. O `.gitignore` já bloqueia esses arquivos.
- Senhas nunca vão no código nem em variável de ambiente, com uma exceção: `SETUP_CODE`, que só cria o primeiro administrador. A senha da Central existe só como **hash** (variável `CENTRAL_HASH` ou `lib/central-cred.js`), nunca a senha.

## Pendências conhecidas

- **StarIA dentro do app:** "Puxar do StarIA", importação em massa, atualizar custos e comparar estoque funcionavam só dentro do Claude. No site publicado, precisam de uma integração direta com a API do StarIA, com credencial do fornecedor. Até lá esses botões avisam que não conseguiram consultar.
- **Fotos e backup grandes:** a Vercel aceita no máximo 4,5 MB por envio. Restaurar um backup acima disso precisa ser pelo terminal (`scripts/migrate.js`).
- **Atualização entre aparelhos:** a tela de outra pessoa atualiza em até 20 segundos, ou no botão Atualizar.
- **Driver do banco próprio (`lib/pg.js`):** feito sem dependências porque o ambiente de criação não tinha npm. Já tem TLS verificado, tempo limite e reaproveitamento de conexão; trocar pelo pacote `pg` ou `@neondatabase/serverless` é simples (só `lib/pg.js` fala com o banco).
- **Carga do banco inteiro por requisição** nas gravações (`/api/sync` e `/api/state`): ok para o volume atual (centenas de pedidos); com milhares, vale carregar só o necessário. Trava do vendedor e negociação já carregam só o que usam.
- **Regras de preço extraídas do app por nome** (`scripts/build-core.js`): mudar o nome de uma função de preço no app exige rodar o build de novo; o GitHub Actions avisa se os arquivos gerados não baterem com o fonte.
- **Arquivos grandes** (`src/app.source.html`, `checkOrderUpdate`) continuam grandes: a quebra em módulos fica para depois, agora com testes que pegam regressão.

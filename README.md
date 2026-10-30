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

## Tino — Central do sistema (dono do sistema)

Este app é a base do **Tino** (*Quem tem Tino, vende melhor.*). A **Central do sistema** fica em `https://SEU-SITE/central` e é só do dono do sistema (usuário `super_admin`), separada do painel da loja.

- **O que faz:** cadastra empresas, troca nome, logo e cor, aplica um modelo por segmento (Atacado completo, Distribuidora de suplementos, Só o básico) e liga/desliga cada módulo.
- **Efeito já hoje (empresa principal, D'Ávila):** módulo desligado some da tela **e** o servidor recusa gravar nele (comissão, ofertas, negociação, entrada de mercadoria, conferência, contagem, entregas, faturamento, a receber/a pagar/caixa, relatórios, decisões, StarIA). Desligar Conferência, Entregas ou Faturamento também tira o login desses papéis. Os marcados como "efeito na próxima etapa" ficam só registrados.
- **Empresas novas** ficam "em preparo": a configuração fica pronta, mas os dados por empresa só existem depois da **separação dos dados por empresa** (próxima etapa).
- **Nada muda para quem já usa:** a empresa atual começa com tudo ligado; as tabelas novas (`tenants`, `central_sessions`) são só acrescentadas.

### Segurança da Central
- Login separado da loja: outro cookie (`__Host-csid`, HttpOnly, Secure, SameSite=Strict), outra tabela de sessões, sessão de 8 h. Sessão da loja não abre a Central e vice-versa.
- Senha do `super_admin` com hash **scrypt** em `lib/central-cred.js` (só o hash, nunca a senha). Senha sorteada com ~115 bits.
- 5 senhas erradas do mesmo IP bloqueiam por 15 min (60 no total, de todos os IPs).
- Mesma proteção CSRF, CSP e cabeçalhos do resto do app; logo só PNG/JPG/WEBP até 300 KB; tudo registrado na tabela `audit`.
- Testes: `python3 tests/central.py` (40 verificações, banco de TESTE) e `npm test`.

### Esqueceu ou perdeu a senha do super_admin
Não existe "recuperar": a senha não fica guardada em lugar nenhum. Gere outra:
```
node scripts/central-senha.js   # mostra a senha nova uma vez e grava o hash
git add lib/central-cred.js && git commit -m "Central: nova senha do super_admin" && git push
```
Ao publicar, as sessões antigas da Central caem.

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
- Senhas nunca vão no código nem em variável de ambiente, com uma exceção: `SETUP_CODE`, que só cria o primeiro administrador. O `lib/central-cred.js` guarda só o **hash** da senha da Central (nunca a senha).

## Pendências conhecidas

- **StarIA dentro do app:** "Puxar do StarIA", importação em massa, atualizar custos e comparar estoque funcionavam só dentro do Claude. No site publicado, precisam de uma integração direta com a API do StarIA, com credencial do fornecedor. Até lá esses botões avisam que não conseguiram consultar.
- **Fotos e backup grandes:** a Vercel aceita no máximo 4,5 MB por envio. Restaurar um backup acima disso precisa ser pelo terminal (`scripts/migrate.js`).
- **Atualização entre aparelhos:** a tela de outra pessoa atualiza em até 20 segundos, ou no botão Atualizar.
- **Driver do banco próprio (`lib/pg.js`):** feito sem dependências porque o ambiente de criação não tinha npm. Já tem TLS verificado, tempo limite e reaproveitamento de conexão; trocar pelo pacote `pg` ou `@neondatabase/serverless` é simples (só `lib/pg.js` fala com o banco).
- **Carga do banco inteiro por requisição** nas gravações (`/api/sync` e `/api/state`): ok para o volume atual (centenas de pedidos); com milhares, vale carregar só o necessário. Trava do vendedor e negociação já carregam só o que usam.
- **Regras de preço extraídas do app por nome** (`scripts/build-core.js`): mudar o nome de uma função de preço no app exige rodar o build de novo; o GitHub Actions avisa se os arquivos gerados não baterem com o fonte.
- **Arquivos grandes** (`src/app.source.html`, `checkOrderUpdate`) continuam grandes: a quebra em módulos fica para depois, agora com testes que pegam regressão.

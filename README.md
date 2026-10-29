# D'Ávila Pedidos

App de pedidos de atacado do ATACADO D'ÁVILA. Seis acessos: cliente, administrador, vendedor, conferente, faturamento e entregador.

**Versão 2 (com servidor).** Login, senhas e dados ficam no servidor. Cada navegador recebe só o que a pessoa logada pode ver.

## Como está organizado

| Pasta | O que tem |
|---|---|
| `public/index.html` | O app (a tela). **Não tem nenhum dado nem senha.** É gerado por `scripts/build-app.js`. |
| `api/index.js` | Única função da Vercel; todas as rotas `/api/*` chegam aqui. |
| `lib/pg.js` | Cliente do Postgres (TLS + SCRAM), sem dependências. |
| `lib/auth.js` | Senhas com hash **scrypt** (N=2^17, r=8, p=1), sessões e bloqueio por tentativas. |
| `lib/policy.js` | **Quem vê o quê e quem pode mudar o quê.** Filtra antes de enviar e confere tudo que chega. |
| `lib/store.js` | Banco: registros, fotos, usuários, importação de backup, senhas provisórias. |
| `lib/core.generated.js` | As mesmas regras de preço/margem/comissão do app, copiadas por `scripts/build-core.js` para o servidor recalcular tudo. |
| `src/app.source.html` | Código original do app (onde se mexe nas telas). |
| `src/server-client.js` | Parte do app que conversa com o servidor (login, sincronização). |
| `tests/` | Testes: segurança (130 verificações) e fluxo completo pedido → entrega. |

Não há pacotes npm para instalar: tudo usa só o Node 20+.

## Segurança: o que mudou

- **Login no servidor.** O navegador manda usuário e senha; o servidor confere contra o hash e devolve um cookie `HttpOnly`, `Secure` e `SameSite=Strict`. O navegador nunca recebe senha de ninguém.
- **Senhas com hash scrypt** (resistente a força bruta, recomendado pela OWASP). No banco fica só o hash; da sessão fica só o SHA-256 do token.
- **5 senhas erradas seguidas** bloqueiam o usuário por 15 minutos. 30 erros vindos do mesmo IP bloqueiam esse IP.
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
- **Nada fica guardado no aparelho:** o app apaga a cópia antiga do protótipo que estava no `localStorage`.
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

## Desenvolver e testar no computador

```
# Postgres local, depois:
export DATABASE_URL="postgres://usuario:senha@127.0.0.1:5432/davila?sslmode=require" PG_INSECURE_TLS=1 DEV_INSECURE_COOKIE=1
node scripts/build-core.js   # só se mudar regra de preço no src/app.source.html (precisa do TypeScript instalado)
node scripts/build-app.js    # gera public/index.html a partir de src/
node scripts/dev-server.js   # http://localhost:3000
```
- Testes (precisam de Python + Playwright): `tests/e2e_setup.py`, `tests/security.py` e `tests/e2e_flow.py`.
- `PG_INSECURE_TLS=1` e `DEV_INSECURE_COOKIE=1` são só para teste local. **Nunca configure essas duas na Vercel.**

## Regras deste repositório

- Repositório **privado**.
- **Nunca** colocar aqui backups (`.json`), planilhas ou PDFs com dados de clientes. O `.gitignore` já bloqueia esses arquivos.
- Senhas nunca vão no código nem em variável de ambiente, com uma exceção: `SETUP_CODE`, que só cria o primeiro administrador.

## Pendências conhecidas

- **StarIA dentro do app:** "Puxar do StarIA", importação em massa, atualizar custos e comparar estoque funcionavam só dentro do Claude. No site publicado, precisam de uma integração direta com a API do StarIA, com credencial do fornecedor. Até lá esses botões avisam que não conseguiram consultar.
- **Fotos e backup grandes:** a Vercel aceita no máximo 4,5 MB por envio. Restaurar um backup acima disso precisa ser pelo terminal (`scripts/migrate.js`).
- **Atualização entre aparelhos:** a tela de outra pessoa atualiza em até 20 segundos, ou no botão Atualizar.

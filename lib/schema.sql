-- Banco do App D'Ávila Pedidos (Postgres / Neon). Pode rodar mais de uma vez.
-- REGRAS DESTE ARQUIVO: todo comando termina com ";" no fim da linha; bloco "do $$ ... $$" fica em UMA linha só
-- (o arquivo é dividido em comandos por ";" + quebra de linha; o teste tests/unit/schema.test.js confere).
-- Tino: tabelas com nome novo (_t). O código antigo procura users/docs/photos e passa a falhar em vez de
-- misturar empresas (voltar para uma versão antiga do app nunca mais lê dados de outra empresa).
do $$ begin if to_regclass('public.users') is not null and to_regclass('public.users_t') is null then alter table users rename to users_t; end if; if to_regclass('public.docs') is not null and to_regclass('public.docs_t') is null then alter table docs rename to docs_t; end if; if to_regclass('public.photos') is not null and to_regclass('public.photos_t') is null then alter table photos rename to photos_t; end if; end $$;
create table if not exists users_t (
  id bigserial primary key,
  role text not null check (role in ('admin','cliente','vendedor','conferente','faturamento','entregador')),
  login text not null,
  doc text,
  ref_id text not null,
  name text,
  pass_hash text,
  must_reset boolean not null default true,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (role, login),
  unique (role, ref_id)
);
create index if not exists users_doc on users_t(role, doc);

create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users_t(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen timestamptz not null default now()
);
create index if not exists sessions_user on sessions(user_id);

create table if not exists login_attempts (
  key text primary key,
  n int not null,
  first_at timestamptz not null
);

-- dados do app: uma linha por registro (produto, cliente, pedido...), com versão para não sobrescrever o trabalho de outra pessoa
create table if not exists docs_t (
  coll text not null,
  id text not null,
  data jsonb not null,
  ver int not null default 1,
  ord double precision,
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);
create index if not exists docs_order_customer on docs_t ((data->>'customerId')) where coll='orders';
create index if not exists docs_order_seller on docs_t ((data->>'sellerId')) where coll='orders';
create index if not exists docs_updated on docs_t (updated_at);

-- fotos (produtos e canhotos) ficam fora do estado para a resposta não passar do limite da Vercel
create table if not exists photos_t (
  id text primary key,
  data text not null,
  created_at timestamptz not null default now()
);

create sequence if not exists order_no start 1001;

-- registro de quem fez o quê (login, troca de senha, recusas de segurança)
create table if not exists audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id bigint,
  role text,
  action text not null,
  detail jsonb
);

-- ===== Tino: Central do sistema (dono do sistema). Só acrescenta tabelas; não mexe nas de cima. =====
-- empresas que usam o sistema; a primeira (primary_tenant) é a dona dos dados atuais
create table if not exists tenants (
  id text primary key,
  name text not null,
  logo text,
  color text,
  segment text,
  status text not null default 'ativa',
  default_on boolean not null default false,
  primary_tenant boolean not null default false,
  modules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- a empresa atual começa com todos os módulos ligados: nada muda para quem já usa
insert into tenants(id,name,segment,status,default_on,primary_tenant) values('davila','Atacado D''Ávila','atacado','ativa',true,true) on conflict (id) do nothing;

-- sessões da Central (separadas das sessões da loja). Guarda só o SHA-256 do token.
create table if not exists central_sessions (
  token_hash text primary key,
  cred_rev text not null,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ===== Tino: dados separados por empresa (tenant_id). Pode rodar mais de uma vez. =====
-- tudo o que já existe pertence à empresa principal (davila)
alter table users_t add column if not exists tenant_id text not null default 'davila';
alter table docs_t add column if not exists tenant_id text not null default 'davila';
alter table photos_t add column if not exists tenant_id text not null default 'davila';
alter table audit add column if not exists tenant_id text;
-- usuário e cadastro são únicos DENTRO da empresa (duas empresas podem ter um "eduardo")
create unique index if not exists users_t_role_login on users_t(tenant_id, role, login);
create unique index if not exists users_t_role_ref on users_t(tenant_id, role, ref_id);
alter table users_t drop constraint if exists users_role_login_key;
alter table users_t drop constraint if exists users_role_ref_id_key;
alter table users_t drop constraint if exists users_t_role_login_key;
alter table users_t drop constraint if exists users_t_role_ref_id_key;
drop index if exists users_doc;
create index if not exists users_t_doc on users_t(tenant_id, role, doc);
-- registros e fotos: a chave passa a incluir a empresa
do $$ declare n text; begin select conname into n from pg_constraint where conrelid='docs_t'::regclass and contype='p' and array_length(conkey,1)=2; if n is not null then execute format('alter table docs_t drop constraint %I', n); alter table docs_t add constraint docs_pkey primary key (tenant_id, coll, id); end if; end $$;
do $$ declare n text; begin select conname into n from pg_constraint where conrelid='photos_t'::regclass and contype='p' and array_length(conkey,1)=1; if n is not null then execute format('alter table photos_t drop constraint %I', n); alter table photos_t add constraint photos_pkey primary key (tenant_id, id); end if; end $$;
-- número do pedido por empresa (a principal continua de onde parou)
create table if not exists order_seq (
  tenant_id text primary key,
  last_no bigint not null
);
insert into order_seq(tenant_id,last_no) select 'davila', case when is_called then last_value else last_value-1 end from order_no on conflict (tenant_id) do nothing;
-- acesso principal de cada empresa, gerado pela Central (sempre o mesmo cadastro)
alter table tenants add column if not exists admin_ref text;
-- depois de preencher o que já existia: toda gravação nova PRECISA dizer a empresa (sem "cair" na principal por esquecimento)
alter table users_t alter column tenant_id drop default;
alter table docs_t alter column tenant_id drop default;
alter table photos_t alter column tenant_id drop default;
do $$ begin if not exists (select 1 from pg_constraint where conname='users_tenant_fk') then alter table users_t add constraint users_tenant_fk foreign key (tenant_id) references tenants(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='docs_tenant_fk') then alter table docs_t add constraint docs_tenant_fk foreign key (tenant_id) references tenants(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='photos_tenant_fk') then alter table photos_t add constraint photos_tenant_fk foreign key (tenant_id) references tenants(id); end if; end $$;

-- ===== Tino PDV (caixa de balcão). Tudo por empresa (tenant_id = empresa). =====
-- novo perfil de acesso: operador de caixa
alter table users_t drop constraint if exists users_role_check;
alter table users_t drop constraint if exists users_t_role_check;
alter table users_t add constraint users_role_check check (role in ('admin','cliente','vendedor','conferente','faturamento','entregador','operador_caixa'));
-- turnos de caixa: abertura com fundo de troco, fechamento às cegas
create table if not exists caixas (
  tenant_id text not null references tenants(id),
  id text not null,
  numero bigint not null,
  operador_id bigint not null,
  operador_nome text,
  aberto_em timestamptz not null default now(),
  fundo numeric(12,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  fechado_em timestamptz,
  contado jsonb,
  esperado jsonb,
  diferenca numeric(12,2),
  justificativa text,
  justificado_por text,
  justificado_em timestamptz,
  primary key (tenant_id, id)
);
create unique index if not exists caixas_um_aberto on caixas(tenant_id, operador_id) where status='aberto';
create index if not exists caixas_dif on caixas(tenant_id) where status='fechado' and diferenca<>0 and justificativa is null;
-- vendas do balcão (o id vem do aparelho: a mesma venda enviada duas vezes grava uma vez só)
create table if not exists pdv_vendas (
  tenant_id text not null references tenants(id),
  id text not null,
  numero bigint not null,
  caixa_id text not null,
  operador_id bigint not null,
  operador_nome text,
  customer_id text,
  customer_nome text,
  ie boolean not null default false,
  subtotal numeric(12,2) not null,
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  custo_total numeric(12,2),
  troco numeric(12,2) not null default 0,
  status text not null default 'concluida' check (status in ('concluida','revisar','cancelada')),
  revisar_motivo text,
  desconto_autorizado_por text,
  offline boolean not null default false,
  criado_no_aparelho timestamptz,
  created_at timestamptz not null default now(),
  pedido_id text,
  nfce_status text,
  nfce_chave text,
  primary key (tenant_id, id),
  foreign key (tenant_id, caixa_id) references caixas(tenant_id, id)
);
create index if not exists pdv_vendas_data on pdv_vendas(tenant_id, created_at);
create index if not exists pdv_vendas_caixa on pdv_vendas(tenant_id, caixa_id);
-- itens com custo e preço DO MOMENTO da venda (o relatório não muda se o cadastro mudar depois)
create table if not exists pdv_itens (
  tenant_id text not null,
  venda_id text not null,
  seq int not null,
  product_id text,
  nome text not null,
  ean text,
  qtd numeric(12,3) not null,
  preco_unit numeric(12,2) not null,
  custo_unit numeric(12,4),
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  cancelado boolean not null default false,
  motivo_cancel text,
  primary key (tenant_id, venda_id, seq),
  foreign key (tenant_id, venda_id) references pdv_vendas(tenant_id, id)
);
create table if not exists pdv_pagamentos (
  tenant_id text not null,
  venda_id text not null,
  seq int not null,
  forma text not null check (forma in ('dinheiro','pix','debito','credito','fiado')),
  valor numeric(12,2) not null check (valor > 0),
  recebido numeric(12,2),
  conferido boolean not null default false,
  receivable_id text,
  primary key (tenant_id, venda_id, seq),
  foreign key (tenant_id, venda_id) references pdv_vendas(tenant_id, id)
);
-- sangria (retirada) e suprimento (reforço) com quem autorizou
create table if not exists caixa_movimentos (
  tenant_id text not null,
  id text not null,
  caixa_id text not null,
  tipo text not null check (tipo in ('sangria','suprimento')),
  valor numeric(12,2) not null check (valor > 0),
  motivo text,
  autorizado_por text not null,
  operador_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, caixa_id) references caixas(tenant_id, id)
);
-- autorização de gerente para desconto: vale uma vez, por 10 minutos, só para a venda autorizada
create table if not exists pdv_autorizacoes (
  token_hash text primary key,
  tenant_id text not null references tenants(id),
  gerente text not null,
  conteudo text not null,
  expira_em timestamptz not null,
  usado_em timestamptz
);
-- numeração das vendas e dos caixas por empresa
create table if not exists pdv_seq (
  tenant_id text not null references tenants(id),
  tipo text not null,
  last_no bigint not null,
  primary key (tenant_id, tipo)
);
-- vendas feitas sem internet que não puderam virar venda (produto apagado, cliente bloqueado...): o gerente resolve no painel
create table if not exists pdv_falhas (
  tenant_id text not null references tenants(id),
  id text not null,
  caixa_id text,
  operador_id bigint,
  operador_nome text,
  dados jsonb not null,
  erro text not null,
  created_at timestamptz not null default now(),
  resolvida_em timestamptz,
  resolvida_por text,
  resolucao text,
  primary key (tenant_id, id)
);
create index if not exists pdv_vendas_revisar on pdv_vendas(tenant_id) where status='revisar';
create index if not exists caixa_mov_caixa on caixa_movimentos(tenant_id, caixa_id);
create index if not exists pdv_aut_expira on pdv_autorizacoes(expira_em);
alter table caixas add column if not exists diferencas jsonb;
alter table caixas add column if not exists tem_dif boolean not null default false;
-- modelos por segmento da Central: os de fábrica podem ser editados (linha com o mesmo id) e o dono cria outros
create table if not exists segments (
  id text primary key,
  name text not null,
  modules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- erros inesperados do servidor (500) para o painel da Central: rota, mensagem e local no código, SEM dados de clientes nem senhas.
-- O mesmo erro repetido soma no contador (n); ficam só os 500 mais recentes.
create table if not exists server_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  n int not null default 1,
  tenant_id text,
  route text not null,
  message text not null,
  place text,
  seen boolean not null default false
);
create index if not exists server_errors_open on server_errors(seen, last_at desc);
-- ===== Tino Produtor rural (outro segmento). Tudo por empresa (tenant_id = empresa). =====
-- ramo da empresa: 'atacado' (atacado e varejo, o app de pedidos) ou 'rural' (app do produtor)
alter table tenants add column if not exists ramo text not null default 'atacado';
-- pessoas da fazenda: meeiros (parceiros com % sobre o valor vendido) e funcionários fixos (salário mensal)
create table if not exists rural_pessoas (
  tenant_id text not null references tenants(id),
  id text not null,
  tipo text not null check (tipo in ('meeiro','funcionario')),
  nome text not null,
  documento text,
  telefone text,
  salario numeric(12,2),
  roca_id text,
  obs text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
-- roças (cada uma é um projeto independente): parceria = {pessoa: %} e regras = {categoria: {dono: %, pessoa: %}}
create table if not exists rural_rocas (
  tenant_id text not null references tenants(id),
  id text not null,
  nome text not null,
  cultura text,
  local text,
  area text,
  inicio date,
  modo text not null default 'funcionarios' check (modo in ('funcionarios','meeiro','misto')),
  parceria jsonb not null default '{}'::jsonb,
  regras jsonb not null default '{}'::jsonb,
  obs text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create table if not exists rural_veiculos (
  tenant_id text not null references tenants(id),
  id text not null,
  nome text not null,
  tipo text,
  placa text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
-- lançamentos: venda, despesa ou adiantamento. partes = divisão em % (venda: retrato da parceria no dia; despesa: quem paga).
-- acertos = {pessoa: acerto}: em quais acertos o lançamento já entrou (cada meeiro acerta a parte dele)
create table if not exists rural_lanc (
  tenant_id text not null references tenants(id),
  id text not null,
  tipo text not null check (tipo in ('venda','despesa','adiantamento')),
  roca_id text,
  data date not null,
  categoria text,
  descricao text,
  valor numeric(12,2) not null check (valor > 0),
  qtd numeric(12,3),
  unidade text,
  preco numeric(12,4),
  comprador text,
  pessoa_id text,
  pessoa_nome text,
  dias numeric(8,2),
  veiculo_id text,
  partes jsonb not null default '{}'::jsonb,
  acertos jsonb not null default '{}'::jsonb,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index if not exists rural_lanc_roca on rural_lanc(tenant_id, roca_id, data);
-- acertos com o meeiro: retrato dos valores no dia (o lançamento fica marcado e não entra de novo)
create table if not exists rural_acertos (
  tenant_id text not null references tenants(id),
  id text not null,
  numero bigint not null,
  roca_id text not null,
  pessoa_id text not null,
  pessoa_nome text,
  data date not null,
  vendas numeric(12,2) not null default 0,
  parte numeric(12,2) not null default 0,
  despesas numeric(12,2) not null default 0,
  adiantamentos numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  itens int not null default 0,
  obs text,
  criado_por text,
  created_at timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_por text,
  primary key (tenant_id, id)
);
create table if not exists rural_seq (
  tenant_id text not null references tenants(id),
  tipo text not null,
  last_no bigint not null,
  primary key (tenant_id, tipo)
);
-- ===== Tino Loja online (ramo 'loja'): vitrine pública + painel do comerciante. Tudo por empresa. =====
-- configuração da loja (WhatsApp, endereço, formas de pagamento, entrega, pedido mínimo, aberta/fechada)
create table if not exists loja_config (
  tenant_id text primary key references tenants(id),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- produtos: variações = [{id,nome,estoque}], faixas = [{min,preco}] (preço por quantidade), fotos = [ids]
create table if not exists loja_produtos (
  tenant_id text not null references tenants(id),
  id text not null,
  nome text not null,
  descricao text,
  categoria text,
  preco numeric(12,2) not null check (preco > 0),
  preco_de numeric(12,2),
  unidade text,
  fotos jsonb not null default '[]'::jsonb,
  grupo_var text,
  variacoes jsonb not null default '[]'::jsonb,
  estoque int,
  faixas jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  destaque boolean not null default false,
  vendidos int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
-- fotos dos produtos (fora da tabela de produtos para a vitrine carregar leve)
create table if not exists loja_fotos (
  tenant_id text not null references tenants(id),
  id text not null,
  data text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
-- pedidos feitos pela vitrine. chave_hash = SHA-256 da chave do link de acompanhamento (a chave fica só com o cliente)
create table if not exists loja_pedidos (
  tenant_id text not null references tenants(id),
  id text not null,
  numero bigint not null,
  chave_hash text not null,
  status text not null default 'novo' check (status in ('novo','confirmado','pronto','entregue','cancelado')),
  cliente_nome text not null,
  cliente_tel text not null,
  entrega text not null check (entrega in ('retirada','entrega')),
  endereco text,
  pagamento text not null,
  obs text,
  itens jsonb not null,
  subtotal numeric(12,2) not null,
  taxa_entrega numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  estoque_baixado boolean not null default false,
  historico jsonb not null default '[]'::jsonb,
  ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create unique index if not exists loja_pedidos_chave on loja_pedidos(tenant_id, chave_hash);
create index if not exists loja_pedidos_data on loja_pedidos(tenant_id, created_at);
create table if not exists loja_seq (
  tenant_id text primary key references tenants(id),
  last_no bigint not null
);
-- roça com a cara da cultura: ícone escolhido (o app tira a cor do ícone)
alter table rural_rocas add column if not exists icone text;
-- forma de pagamento da venda (dinheiro, pix, cheque, transferencia, prazo); vence = vencimento do cheque ou data para receber a prazo
alter table rural_lanc add column if not exists pagamento text;
alter table rural_lanc add column if not exists vence date;
alter table rural_lanc add column if not exists cheque jsonb not null default '{}'::jsonb;
-- loja: código do produto (EAN ou código do ERP, para importar e atualizar sem duplicar) e custo (só o painel vê)
alter table loja_produtos add column if not exists codigo text;
alter table loja_produtos add column if not exists custo numeric(12,2);
create unique index if not exists loja_produtos_codigo on loja_produtos(tenant_id, lower(codigo)) where codigo is not null;
-- pedidos de consulta ao StarIA feitos pela loja (o Claude consulta e devolve o resultado; a loja revisa e importa)
create table if not exists loja_staria (
  tenant_id text not null references tenants(id),
  id text not null,
  termos jsonb not null,
  status text not null default 'pendente' check (status in ('pendente','pronta','importada')),
  resultados jsonb not null default '{}'::jsonb,
  criado_por text,
  feito_por text,
  feito_em timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
-- tipo da consulta: 'importar' (produtos novos) ou 'precos' (atualização de preço: venda do momento, ou a promoção em vigor)
alter table loja_staria add column if not exists tipo text not null default 'importar';
-- pagamento da venda dividido em partes: [{forma, valor, vence, cheque}] (a soma fecha com o valor da venda)
alter table rural_lanc add column if not exists pagamentos jsonb not null default '[]'::jsonb;
-- valor para o meeiro (opcional): o patrão vende por valor (relatórios) e o meeiro ganha a % dele sobre base
alter table rural_lanc add column if not exists base numeric(12,2);
-- cada meeiro tem a parte dele na roça: pés (opcional) e a % dele sobre a venda da parte dele; a venda guarda de quem foi (origem)
alter table rural_rocas add column if not exists pes jsonb not null default '{}'::jsonb;
alter table rural_lanc add column if not exists origem jsonb not null default '[]'::jsonb;
-- venda da colheita: tipos do produto da roça (Top, Torto…) e, na venda, cada tipo com caixas, preços e as caixas de cada um
alter table rural_rocas add column if not exists produtos jsonb not null default '[]'::jsonb;
alter table rural_lanc add column if not exists itens jsonb not null default '[]'::jsonb;

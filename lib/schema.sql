-- Banco do App D'Ávila Pedidos (Postgres / Neon). Pode rodar mais de uma vez.
-- REGRAS DESTE ARQUIVO: todo comando termina com ";" no fim da linha; bloco "do $$ ... $$" fica em UMA linha só
-- (o arquivo é dividido em comandos por ";" + quebra de linha; o teste tests/unit/schema.test.js confere).
create table if not exists users (
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
create index if not exists users_doc on users(role, doc);

create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
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
create table if not exists docs (
  coll text not null,
  id text not null,
  data jsonb not null,
  ver int not null default 1,
  ord double precision,
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);
create index if not exists docs_order_customer on docs ((data->>'customerId')) where coll='orders';
create index if not exists docs_order_seller on docs ((data->>'sellerId')) where coll='orders';
create index if not exists docs_updated on docs (updated_at);

-- fotos (produtos e canhotos) ficam fora do estado para a resposta não passar do limite da Vercel
create table if not exists photos (
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
alter table users add column if not exists tenant_id text not null default 'davila';
alter table docs add column if not exists tenant_id text not null default 'davila';
alter table photos add column if not exists tenant_id text not null default 'davila';
alter table audit add column if not exists tenant_id text;
-- usuário e cadastro são únicos DENTRO da empresa (duas empresas podem ter um "eduardo")
create unique index if not exists users_t_role_login on users(tenant_id, role, login);
create unique index if not exists users_t_role_ref on users(tenant_id, role, ref_id);
alter table users drop constraint if exists users_role_login_key;
alter table users drop constraint if exists users_role_ref_id_key;
drop index if exists users_doc;
create index if not exists users_t_doc on users(tenant_id, role, doc);
-- registros e fotos: a chave passa a incluir a empresa
do $$ begin if exists (select 1 from pg_constraint where conname='docs_pkey' and array_length(conkey,1)=2) then alter table docs drop constraint docs_pkey; alter table docs add constraint docs_pkey primary key (tenant_id, coll, id); end if; end $$;
do $$ begin if exists (select 1 from pg_constraint where conname='photos_pkey' and array_length(conkey,1)=1) then alter table photos drop constraint photos_pkey; alter table photos add constraint photos_pkey primary key (tenant_id, id); end if; end $$;
-- número do pedido por empresa (a principal continua de onde parou)
create table if not exists order_seq (
  tenant_id text primary key,
  last_no bigint not null
);
insert into order_seq(tenant_id,last_no) select 'davila', case when is_called then last_value else last_value-1 end from order_no on conflict (tenant_id) do nothing;
-- acesso principal de cada empresa, gerado pela Central (sempre o mesmo cadastro)
alter table tenants add column if not exists admin_ref text;
-- depois de preencher o que já existia: toda gravação nova PRECISA dizer a empresa (sem "cair" na principal por esquecimento)
alter table users alter column tenant_id drop default;
alter table docs alter column tenant_id drop default;
alter table photos alter column tenant_id drop default;
do $$ begin if not exists (select 1 from pg_constraint where conname='users_tenant_fk') then alter table users add constraint users_tenant_fk foreign key (tenant_id) references tenants(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='docs_tenant_fk') then alter table docs add constraint docs_tenant_fk foreign key (tenant_id) references tenants(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='photos_tenant_fk') then alter table photos add constraint photos_tenant_fk foreign key (tenant_id) references tenants(id); end if; end $$;

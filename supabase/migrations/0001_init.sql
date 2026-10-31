-- Webchat DataCrazy — schema inicial.
-- Pode ser aplicado pelo painel (/admin, botão "Criar tabelas") ou colado no SQL Editor do Supabase.
-- Todas as tabelas têm RLS ligado e nenhuma policy: só o servidor (service role) acessa.

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  -- JSON criptografado (AES-256-GCM, chave derivada do APP_SECRET): API key do DataCrazy e segredos.
  secrets text,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sessions (
  id uuid primary key,
  name text not null,
  email text,
  phone text,
  consent_at timestamptz,
  consent_version text,
  consent_text text,
  page_url text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  user_agent text,
  -- Webhook da automação disparado no envio do formulário.
  lead_webhook_status text not null default 'pending' check (lead_webhook_status in ('pending', 'ok', 'failed', 'skipped')),
  lead_webhook_error text,
  lead_webhook_attempts integer not null default 0,
  lead_webhook_next_at timestamptz,
  -- Anotação interna na conversa (opcional, precisa da API key).
  note_status text not null default 'skipped' check (note_status in ('pending', 'ok', 'failed', 'skipped')),
  note_error text,
  note_attempts integer not null default 0,
  note_next_at timestamptz,
  dc_conversation_id text,
  dc_lead_id text,
  created_at timestamptz not null default now(),
  first_message_at timestamptz,
  last_message_at timestamptz,
  first_agent_reply_at timestamptz
);
create index if not exists sessions_created_at_idx on public.sessions (created_at desc);
create index if not exists sessions_lead_webhook_retry_idx on public.sessions (lead_webhook_next_at) where lead_webhook_status = 'pending';
create index if not exists sessions_note_retry_idx on public.sessions (note_next_at) where note_status = 'pending';

create table if not exists public.messages (
  id uuid primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  author text not null check (author in ('visitor', 'agent', 'system')),
  text text not null default '',
  attachment jsonb,
  -- ID da mensagem no DataCrazy (respostas do atendente): garante idempotência do outbound.
  dc_message_id text unique,
  delivery_status text check (delivery_status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on public.messages (session_id, created_at);
create index if not exists messages_retry_idx on public.messages (next_attempt_at) where delivery_status = 'pending';

create table if not exists public.attachments (
  id uuid primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  path text not null,
  mime_type text not null,
  filename text not null,
  size integer not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_session_idx on public.attachments (session_id);

create table if not exists public.integration_logs (
  id bigserial primary key,
  kind text not null,
  status text not null check (status in ('ok', 'error')),
  session_id uuid,
  summary jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists integration_logs_created_idx on public.integration_logs (created_at desc);

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

alter table public.settings enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.integration_logs enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.settings, public.sessions, public.messages, public.attachments, public.integration_logs, public.rate_limits from anon, authenticated;

-- Janela fixa: devolve true se a chamada ainda cabe no limite.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into current_count;
  return current_count <= p_max;
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- Limpeza: logs de integração (7 dias), janelas de rate limit vencidas e, se configurado,
-- sessões mais antigas que a retenção (o histórico oficial fica no DataCrazy).
create or replace function public.cleanup(p_retention_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.integration_logs where created_at < now() - interval '7 days';
  delete from public.rate_limits where window_start < now() - interval '1 day';
  if p_retention_days is not null and p_retention_days > 0 then
    delete from public.sessions where coalesce(last_message_at, created_at) < now() - make_interval(days => p_retention_days);
  end if;
end;
$$;
revoke execute on function public.cleanup(integer) from public, anon, authenticated;

-- Buckets: anexos dos visitantes (privado, servidos por /files com link assinado) e
-- arquivos públicos do widget (avatar).
insert into storage.buckets (id, name, public, file_size_limit)
values ('webchat', 'webchat', false, 26214400)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('webchat-public', 'webchat-public', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

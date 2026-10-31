-- Conversas abertas pela aba "Testar" do painel passam a ser marcadas pelo servidor (antes era pela URL
-- da página, que o visitante controla).
alter table public.sessions add column if not exists is_test boolean not null default false;
create index if not exists sessions_is_test_idx on public.sessions (is_test, created_at desc);

-- Devolve uma unidade de um contador de rate limit (ex.: login que deu certo), de forma atômica.
create or replace function public.rate_limit_refund(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rate_limits set count = greatest(count - 1, 0) where key = p_key;
$$;
revoke execute on function public.rate_limit_refund(text) from public, anon, authenticated;

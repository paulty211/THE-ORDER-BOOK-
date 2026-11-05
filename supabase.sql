-- THE ORDER BOOK – online business registrations.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.businesses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null unique default auth.uid(),      -- the phone's anonymous account
  business_code  text not null unique,                          -- the Business ID shown in the app, e.g. TOB-Q82TI
  business_name  text not null check (char_length(business_name) between 1 and 80),
  owner_name     text not null check (char_length(owner_name)    between 1 and 80),
  business_type  text not null check (business_type in ('food','fashion','beauty','events','print','repair','cleaning','retail','other')),
  phone          text not null check (char_length(phone)         between 5 and 30),
  address        text check (char_length(address)    <= 160),
  email          text check (char_length(email)      <= 120),
  cac_number     text check (char_length(cac_number) <= 40),
  language       text check (language in ('en','pcm')),
  app_version    text check (char_length(app_version) <= 20),
  registered_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.tob_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tob_businesses_touch on public.businesses;
create trigger tob_businesses_touch before update on public.businesses
  for each row execute function public.tob_touch_updated_at();

-- Security: a phone can create, read and change ONLY its own row. Nobody can read other businesses.
-- You (the owner) see everything in the Supabase dashboard -> Table Editor, which bypasses these rules.
alter table public.businesses enable row level security;

drop policy if exists "own registration: read"   on public.businesses;
drop policy if exists "own registration: create" on public.businesses;
drop policy if exists "own registration: update" on public.businesses;

create policy "own registration: read"   on public.businesses for select to authenticated using (owner_id = auth.uid());
create policy "own registration: create" on public.businesses for insert to authenticated with check (owner_id = auth.uid());
create policy "own registration: update" on public.businesses for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Handy view for you: one row per business, newest first (use it in the Table Editor or export it as CSV).
create or replace view public.business_register with (security_invoker = true) as
  select business_code, business_name, owner_name, business_type, phone, address, email, cac_number, language, registered_at, updated_at
  from public.businesses order by registered_at desc;

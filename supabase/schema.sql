-- ===========================================================================
-- Ponašanje potrošača u turizmu — AI asistent kolegija · shema baze
-- Veleučilište Baltazar Zaprešić · Management u turizmu i ugostiteljstvu
--
-- Primjena: Supabase Dashboard → SQL Editor → zalijepite i izvršite
-- (ili lokalno: psql "$SUPABASE_DB_URL" -f supabase/schema.sql)
--
-- Izvor istine: veleučilišni priručnik „Ponašanje potrošača u turizmu".
-- Dopunski izvori (industrijska izvješća navedena u priručniku) žive u istoj
-- tablici isječaka, ali s vrstom 'dopunski' i NIKAD nisu u zadanom opsegu
-- dohvata — vidi funkcije match_chunks / search_chunks_fts.
--
-- !! VAŽNO — DIMENZIJA VEKTORA !!
-- Stupac ugradnje.ugradnja deklariran je kao vector(1536), za OpenAI
-- text-embedding-3-small. Promijenite li model, uskladite SVA pojavljivanja
-- "vector(1536)" i EMBEDDING_DIM u .env, pa ponovno pokrenite ingest.
--
-- Sigurnosni model: RLS je uključen na SVIM tablicama, namjerno BEZ politika —
-- čitanje/pisanje ide isključivo preko Next.js API ruta i server komponenata
-- koje koriste service-role klijent i same provjeravaju identitet (lib/auth.ts).
-- Anon klijent iz preglednika nema pristup ničemu osim vlastite Auth sesije.
-- ===========================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- Normalizacija za full-text: bez dijakritika i malim slovima, jer hrvatski
-- nema ugrađenu tsearch konfiguraciju u Postgresu (koristi se 'simple').
create or replace function fts_norm(p text)
returns text language sql immutable as $$
  select unaccent(lower(coalesce(p, '')))
$$;

-- ---------------------------------------------------------------------------
-- Korisnički profili (uloge: student / nastavnik)
--
-- Autentikacija je implementirana, ali privremeno umirovljena (AUTH_ENABLED).
-- Zato tablice napretka i pokušaja NEMAJU strani ključ prema profilima:
-- user_id je UUID koji je ili Supabase Auth korisnik (kad je autentikacija
-- uključena) ili anonimni identifikator gosta iz kolačića (dok je isključena).
-- Uključivanje autentikacije zato ne traži nikakvu migraciju sheme.
-- ---------------------------------------------------------------------------
create table if not exists profili (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  puno_ime    text not null default '',
  uloga       text not null default 'student' check (uloga in ('student', 'nastavnik')),
  created_at  timestamptz not null default now()
);

-- Automatsko kreiranje profila pri registraciji (Supabase Auth trigger).
-- security definer + fiksni search_path: GoTrue poziva trigger sa
-- search_path = auth, pa bez ovoga "profili" ne bi bili pronađeni.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, email, puno_ime)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'puno_ime', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Izvori: priručnik (izvor istine) + dopunski dokumenti navedeni u priručniku
-- ---------------------------------------------------------------------------
create table if not exists izvori (
  id               uuid primary key default gen_random_uuid(),
  oznaka           text not null unique,     -- npr. 'prirucnik', 'skift-mckinsey-2025'
  vrsta            text not null check (vrsta in ('prirucnik', 'dopunski')),
  naslov           text not null,
  autor            text not null default '',
  godina           int,
  jezik            text not null default 'hr',
  url              text not null default '',
  napomena         text not null default '',
  ukupno_stranica  int,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Hijerarhija sadržaja: Poglavlje → Lekcija → Ciljevi učenja / Mediji
-- ---------------------------------------------------------------------------
create table if not exists poglavlja (
  id          uuid primary key default gen_random_uuid(),
  broj        int  not null unique,
  naslov      text not null,
  dio         text not null default '',      -- "DIO I · Temelji ponašanja potrošača"
  opis        text not null default '',
  stranica_od int  not null default 0,
  stranica_do int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists lekcije (
  id            uuid primary key default gen_random_uuid(),
  poglavlje_id  uuid not null references poglavlja (id) on delete cascade,
  broj          int  not null,               -- globalni redni broj lekcije (L1..Ln)
  oznaka        text not null default '',    -- oznaka odjeljka u priručniku, npr. "4.4"
  naslov        text not null,
  stranica_od   int  not null,
  stranica_do   int  not null,
  redoslijed    int  not null default 0,
  sazetak_md    text not null default '',    -- Markdown s ### podnaslovima
  created_at    timestamptz not null default now(),
  unique (poglavlje_id, broj)
);

create index if not exists lekcije_poglavlje_idx on lekcije (poglavlje_id, redoslijed);

create table if not exists ciljevi_ucenja (
  id                uuid primary key default gen_random_uuid(),
  lekcija_id        uuid not null references lekcije (id) on delete cascade,
  tekst             text not null,
  kognitivna_razina text not null default '',  -- Bloom: "razumijevanje", "primjena", …
  stranica          int,
  redoslijed        int  not null default 0,
  -- Nacrti koje je pripremila skripta čekaju potvrdu nastavnika.
  odobreno          boolean not null default false
);

create index if not exists ciljevi_lekcija_idx on ciljevi_ucenja (lekcija_id, redoslijed);

-- Mediji su izvan Gita: ovdje se čuva samo URL (Supabase Storage ili vanjski).
-- Konvencija imenovanja u Storageu: NN-kratki-opis.ext (npr. 04-zmot.mp4).
create table if not exists mediji (
  id          uuid primary key default gen_random_uuid(),
  lekcija_id  uuid not null references lekcije (id) on delete cascade,
  tip         text not null check (tip in ('video', 'audio', 'prezentacija')),
  naslov      text not null default '',
  url         text not null,
  trajanje_s  int,
  redoslijed  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists mediji_lekcija_idx on mediji (lekcija_id);

-- ---------------------------------------------------------------------------
-- RAG: isječci teksta (chunkovi) + vektorske ugradnje
--
-- lekcija_id je NULL za isječke dopunskih izvora (oni nisu dio kurikuluma).
-- ---------------------------------------------------------------------------
create table if not exists chunkovi (
  id               uuid primary key default gen_random_uuid(),
  izvor_id         uuid not null references izvori (id) on delete cascade,
  lekcija_id       uuid references lekcije (id) on delete cascade,
  chunk_index      int  not null,
  text             text not null,
  stranica_od      int  not null,
  stranica_do      int  not null,
  naslov_odjeljka  text not null default '',
  kljucne_rijeci   text[] not null default '{}',
  tokens_est       int  not null default 0,
  fts              tsvector generated always as (to_tsvector('simple', fts_norm(text))) stored,
  created_at       timestamptz not null default now(),
  unique (izvor_id, lekcija_id, chunk_index)
);

create index if not exists chunkovi_lekcija_idx on chunkovi (lekcija_id);
create index if not exists chunkovi_izvor_idx   on chunkovi (izvor_id);
create index if not exists chunkovi_fts_idx     on chunkovi using gin (fts);

create table if not exists ugradnje (
  chunk_id    uuid primary key references chunkovi (id) on delete cascade,
  ugradnja    vector(1536) not null,   -- <-- USKLADITI s EMBEDDING_DIM!
  norm        real not null default 1.0,
  created_at  timestamptz not null default now()
);

create index if not exists ugradnje_hnsw_idx
  on ugradnje using hnsw (ugradnja vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Kviz: pitanja na razini poglavlja (kombiniraju pitanja svih lekcija)
--
-- Pitanja unosi NASTAVNIK (scripts/uvezi-kviz.ts) ili se pripremaju kao NACRT
-- (scripts/generiraj-nacrte.ts) i čekaju odobreno = true. Studentima se
-- prikazuju ISKLJUČIVO odobrena pitanja — asistent nikad ne postavlja
-- neodobrena pitanja kao gradivo.
-- ---------------------------------------------------------------------------
create table if not exists kviz_pitanja (
  id            uuid primary key default gen_random_uuid(),
  poglavlje_id  uuid not null references poglavlja (id) on delete cascade,
  lekcija_id    uuid references lekcije (id) on delete set null,
  pitanje       text not null,
  odgovori      jsonb not null,           -- ["a", "b", "c", "d"] (točno 4)
  tocan_index   int  not null check (tocan_index between 0 and 3),
  objasnjenje   text not null default '',
  stranica_ref  text not null default '',
  odobreno      boolean not null default false,
  izvor_unosa   text not null default 'nastavnik' check (izvor_unosa in ('nastavnik', 'nacrt')),
  created_at    timestamptz not null default now()
);

create index if not exists kviz_pitanja_poglavlje_idx on kviz_pitanja (poglavlje_id) where odobreno;

create table if not exists kviz_pokusaji (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  poglavlje_id   uuid references poglavlja (id) on delete cascade,
  zavrsna        boolean not null default false,
  tocno          int  not null default 0,
  ukupno         int  not null default 0,
  odgovori       jsonb not null default '[]'::jsonb,
  zavrseno_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists kviz_pokusaji_user_idx on kviz_pokusaji (user_id, poglavlje_id);

-- ---------------------------------------------------------------------------
-- Praćenje napretka po lekciji
-- ---------------------------------------------------------------------------
create table if not exists napredak (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  lekcija_id          uuid not null references lekcije (id) on delete cascade,
  posjeceno           boolean not null default false,
  zavrseno            boolean not null default false,
  posljednji_pristup  timestamptz not null default now(),
  unique (user_id, lekcija_id)
);

create index if not exists napredak_user_idx on napredak (user_id);

-- ---------------------------------------------------------------------------
-- Usmena vježba: SAMO transkripti i metrike — audio snimke se ne pohranjuju
-- ---------------------------------------------------------------------------
create table if not exists usmene_vjezbe_pokusaji (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  lekcija_id      uuid references lekcije (id) on delete set null,
  poglavlje_id    uuid references poglavlja (id) on delete set null,
  pitanje         text not null,
  transkript      text not null default '',
  procjena        text check (procjena in ('uglavnom točno', 'djelomično', 'netočno')),
  nedostaje       jsonb not null default '[]'::jsonb,
  pogresno        jsonb not null default '[]'::jsonb,
  savjeti         jsonb not null default '[]'::jsonb,
  idealni_odgovor text not null default '',
  rubrika         jsonb not null default '{}'::jsonb, -- {tocnost,pokrivenost,terminologija,jasnoca} 0-2
  created_at      timestamptz not null default now()
);

create index if not exists usmene_vjezbe_user_idx on usmene_vjezbe_pokusaji (user_id);

-- ---------------------------------------------------------------------------
-- Telemetrija: metrike kvalitete BEZ sadržaja razgovora (vidi lib/telemetrija.ts)
-- ---------------------------------------------------------------------------
create table if not exists telemetrija (
  id             bigserial primary key,
  vrsta          text not null,
  lekcija_id     uuid,
  poglavlje_id   uuid,
  ima_kontekst   boolean not null default false,
  broj_isjecaka  int not null default 0,
  najbolji_score real,
  trajanje_ms    int not null default 0,
  rubrika_zbroj  int,
  created_at     timestamptz not null default now()
);

create index if not exists telemetrija_vrsta_idx on telemetrija (vrsta, created_at desc);

-- Sažeti pogled na kriterije uspjeha MVP-a (udio odgovora bez konteksta,
-- prosječno vrijeme odgovora, prosječna pokrivenost rubrikom).
create or replace view telemetrija_sazetak as
  select
    vrsta,
    count(*)                                              as broj,
    round(100.0 * avg((not ima_kontekst)::int), 1)        as postotak_bez_konteksta,
    round(avg(trajanje_ms))                               as prosjecno_ms,
    round(avg(rubrika_zbroj)::numeric, 2)                 as prosjecna_rubrika
  from telemetrija
  group by vrsta;

-- ---------------------------------------------------------------------------
-- RLS — uključeno svugdje, bez politika (pristup isključivo preko service role
-- iz Next.js koda, koji sam provjerava identitet i ulogu).
-- ---------------------------------------------------------------------------
alter table profili                  enable row level security;
alter table izvori                   enable row level security;
alter table poglavlja                enable row level security;
alter table lekcije                  enable row level security;
alter table ciljevi_ucenja           enable row level security;
alter table mediji                   enable row level security;
alter table chunkovi                 enable row level security;
alter table ugradnje                 enable row level security;
alter table kviz_pitanja             enable row level security;
alter table kviz_pokusaji            enable row level security;
alter table napredak                 enable row level security;
alter table usmene_vjezbe_pokusaji   enable row level security;
alter table telemetrija              enable row level security;

-- ===========================================================================
-- RPC funkcije — hibridni RAG dohvat (semantička sličnost + full-text)
--
-- Opseg: lekcija → poglavlje → cijeli priručnik. Dopunski izvori ulaze samo
-- kad je p_ukljuci_dopunske = true, i nikad ne sužavaju opseg po lekciji.
-- ===========================================================================

create or replace function match_chunks(
  query_embedding    vector(1536),
  match_count        int  default 12,
  p_lekcija_id       uuid default null,
  p_poglavlje_id     uuid default null,
  p_ukljuci_dopunske boolean default false
)
returns table (
  chunk_id         uuid,
  text             text,
  izvor_vrsta      text,
  izvor_naslov     text,
  lekcija_id       uuid,
  naslov_lekcije   text,
  naslov_odjeljka  text,
  stranica_od      int,
  stranica_do      int,
  poglavlje_broj   int,
  poglavlje_naslov text,
  score            float
)
language sql stable as $$
  select
    c.id, c.text, i.vrsta, i.naslov, c.lekcija_id, l.naslov, c.naslov_odjeljka,
    c.stranica_od, c.stranica_do, p.broj, p.naslov,
    1 - (u.ugradnja <=> query_embedding) as score
  from ugradnje u
  join chunkovi c  on c.id = u.chunk_id
  join izvori   i  on i.id = c.izvor_id
  left join lekcije   l on l.id = c.lekcija_id
  left join poglavlja p on p.id = l.poglavlje_id
  where (i.vrsta = 'prirucnik' or p_ukljuci_dopunske)
    and (p_lekcija_id   is null or c.lekcija_id   = p_lekcija_id or i.vrsta = 'dopunski')
    and (p_poglavlje_id is null or l.poglavlje_id = p_poglavlje_id or i.vrsta = 'dopunski')
  order by u.ugradnja <=> query_embedding
  limit match_count;
$$;

create or replace function search_chunks_fts(
  query_text         text,
  match_count        int  default 12,
  p_lekcija_id       uuid default null,
  p_poglavlje_id     uuid default null,
  p_ukljuci_dopunske boolean default false
)
returns table (
  chunk_id         uuid,
  text             text,
  izvor_vrsta      text,
  izvor_naslov     text,
  lekcija_id       uuid,
  naslov_lekcije   text,
  naslov_odjeljka  text,
  stranica_od      int,
  stranica_do      int,
  poglavlje_broj   int,
  poglavlje_naslov text,
  score            float
)
language sql stable as $$
  with q as (
    -- Prefiksni upit na skraćenim osnovama riječi: gruba zamjena za stemmer,
    -- dovoljna da hrvatski padeži („odluke", „odlukama") pogode isti isječak.
    select string_agg(distinct w || ':*', ' | ') as tsq
    from (
      select left(regexp_replace(t, '[^a-z0-9]', '', 'g'), 5) as w
      from unnest(regexp_split_to_array(fts_norm(query_text), '\s+')) as t
    ) s
    where length(w) >= 3
  )
  select
    c.id, c.text, i.vrsta, i.naslov, c.lekcija_id, l.naslov, c.naslov_odjeljka,
    c.stranica_od, c.stranica_do, p.broj, p.naslov,
    ts_rank(c.fts, to_tsquery('simple', q.tsq))::float as score
  from chunkovi c
  join izvori i on i.id = c.izvor_id
  left join lekcije   l on l.id = c.lekcija_id
  left join poglavlja p on p.id = l.poglavlje_id
  cross join q
  where coalesce(q.tsq, '') <> ''
    and c.fts @@ to_tsquery('simple', q.tsq)
    and (i.vrsta = 'prirucnik' or p_ukljuci_dopunske)
    and (p_lekcija_id   is null or c.lekcija_id   = p_lekcija_id or i.vrsta = 'dopunski')
    and (p_poglavlje_id is null or l.poglavlje_id = p_poglavlje_id or i.vrsta = 'dopunski')
  order by score desc
  limit match_count;
$$;

-- Transakcijski upsert isječaka jedne lekcije (ili jednog dopunskog izvora).
-- p_chunks: [{chunk_index, text, stranica_od, stranica_do, naslov_odjeljka,
--             kljucne_rijeci: [...], tokens_est, embedding: [...], norm}]
create or replace function upsert_chunkovi(
  p_izvor_id   uuid,
  p_lekcija_id uuid,
  p_chunks     jsonb
)
returns void
language plpgsql as $$
begin
  delete from chunkovi
   where izvor_id = p_izvor_id
     and lekcija_id is not distinct from p_lekcija_id;

  with ins as (
    insert into chunkovi (izvor_id, lekcija_id, chunk_index, text, stranica_od, stranica_do,
                          naslov_odjeljka, kljucne_rijeci, tokens_est)
    select
      p_izvor_id,
      p_lekcija_id,
      (c->>'chunk_index')::int,
      c->>'text',
      (c->>'stranica_od')::int,
      (c->>'stranica_do')::int,
      coalesce(c->>'naslov_odjeljka', ''),
      coalesce((select array_agg(x) from jsonb_array_elements_text(c->'kljucne_rijeci') x), '{}'),
      coalesce((c->>'tokens_est')::int, 0)
    from jsonb_array_elements(p_chunks) as c
    returning id, chunk_index
  )
  insert into ugradnje (chunk_id, ugradnja, norm)
  select ins.id, (c->>'embedding')::vector, coalesce((c->>'norm')::real, 1.0)
  from ins
  join jsonb_array_elements(p_chunks) as c
    on (c->>'chunk_index')::int = ins.chunk_index;
end;
$$;

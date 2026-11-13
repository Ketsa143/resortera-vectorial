create table if not exists public.resultados (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  run_id        text        not null check (char_length(run_id) between 8 and 64),
  jugador       text        not null check (char_length(jugador) between 1 and 40),
  sala          text        not null check (char_length(sala) between 1 and 30),
  nivel         int         not null check (nivel between 1 and 10),
  nivel_nombre  text,
  acierto       boolean     not null,
  intentos      int         not null check (intentos between 1 and 3),
  puntos        int         not null check (puntos between 0 and 1600),
  segundos      int         check (segundos >= 0),
  detalle       jsonb,
  unique (run_id, nivel)    -- un registro por nivel en cada partida
);

create index if not exists resultados_fecha_idx on public.resultados (created_at);
create index if not exists resultados_sala_fecha_idx on public.resultados (sala, created_at);

-- Seguridad a nivel de fila: el juego (clave anon) puede insertar y leer,
-- pero nadie puede editar ni borrar resultados desde el navegador.
alter table public.resultados enable row level security;

drop policy if exists "juego inserta" on public.resultados;
create policy "juego inserta" on public.resultados
  for insert to anon with check (true);

drop policy if exists "todos leen" on public.resultados;
create policy "todos leen" on public.resultados
  for select to anon using (true);

-- La fecha la pone el servidor, no el navegador (evita fechas falsas)
create or replace function public.rv_fecha_servidor() returns trigger
language plpgsql as $$
begin
  new.created_at := now();
  return new;
end $$;

drop trigger if exists rv_fecha_servidor on public.resultados;
create trigger rv_fecha_servidor before insert on public.resultados
  for each row execute function public.rv_fecha_servidor();

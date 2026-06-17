-- =====================================================================
-- 0003_ncm_aranceles.sql
-- Nueva tabla ncm_aranceles + columna ncm_id en carpetas
-- =====================================================================

-- ---------------------------------------------------------------------
-- NCM_ARANCELES
-- Tabla mantenida manualmente por el usuario. Cada fila representa una
-- posición arancelaria con sus tasas impositivas específicas.
-- ---------------------------------------------------------------------
create table ncm_aranceles (
  id uuid primary key default gen_random_uuid(),
  codigo_ncm text not null unique,
  descripcion text,
  derecho_importacion_pct numeric not null default 0,
  iva_pct numeric not null default 21,      -- solo 21 o 10.5 en la práctica
  aplica_iva_adicional boolean not null default false,
  iva_adicional_pct numeric not null default 0,
  aplica_anticipo_ganancias boolean not null default false,
  anticipo_ganancias_pct numeric not null default 0,
  aplica_iibb boolean not null default false,
  iibb_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ncm_aranceles_codigo_ncm on ncm_aranceles(codigo_ncm);

-- Trigger para actualizar updated_at automáticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ncm_aranceles_updated_at
  before update on ncm_aranceles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Columna ncm_id en carpetas
-- El campo texto ncm ya existente queda como display/legacy.
-- ---------------------------------------------------------------------
alter table carpetas
  add column ncm_id uuid references ncm_aranceles(id);

create index idx_carpetas_ncm_id on carpetas(ncm_id);

-- ---------------------------------------------------------------------
-- RLS para ncm_aranceles
-- SELECT: todos los roles
-- INSERT/UPDATE: admin y operador
-- DELETE: solo admin
-- ---------------------------------------------------------------------
alter table ncm_aranceles enable row level security;

create policy "ncm_aranceles_select" on ncm_aranceles
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "ncm_aranceles_insert" on ncm_aranceles
  for insert with check (public.current_user_rol() in ('admin', 'operador'));

create policy "ncm_aranceles_update" on ncm_aranceles
  for update using (public.current_user_rol() in ('admin', 'operador'));

create policy "ncm_aranceles_delete" on ncm_aranceles
  for delete using (public.current_user_rol() = 'admin');

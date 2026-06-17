-- =====================================================================
-- 0001_init.sql
-- Schema inicial: gestión de costos de importación (Argentina)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type rol_usuario as enum ('admin', 'operador', 'viewer');
create type tipo_contenedor as enum ('FCL_20', 'FCL_40', 'FCL_40HC', 'LCL', 'AEREO');
create type estado_carpeta as enum ('simulacion', 'pre_embarque', 'en_transito', 'en_aduana', 'finalizada');
create type nivel_costo as enum ('carpeta', 'contenedor');
create type categoria_costo as enum ('impuesto', 'flete', 'seguro', 'honorarios', 'bancario', 'imprevistos', 'otro');
create type origen_costo as enum ('simulador', 'manual', 'pdf_despachante');
create type criterio_prorrateo_tipo as enum ('cbm', 'peso', 'fob', 'unidades');

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol rol_usuario not null default 'viewer',
  nombre text,
  created_at timestamptz not null default now()
);

-- Función helper SECURITY DEFINER: lee el rol del usuario autenticado actual.
-- Vive en public (Supabase no permite crear funciones en el schema auth desde el SQL Editor).
create or replace function public.current_user_rol()
returns rol_usuario
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- PARAMETROS_GLOBALES
-- Tabla de solo-INSERT (append-only). NUNCA hacer UPDATE: cada cambio de
-- parámetros crea una nueva fila. Las carpetas referencian la fila vigente
-- al momento de su creación vía parametros_snapshot_id, para que cambios
-- futuros en los parámetros no alteren simulaciones/carpetas ya creadas.
-- ---------------------------------------------------------------------
create table parametros_globales (
  id uuid primary key default gen_random_uuid(),
  gasto_terminal_usd numeric not null default 0,
  flete_interno_usd numeric not null default 0,
  seguro_pct numeric not null default 0,
  derecho_importacion_pct numeric not null default 0,
  tasa_estadistica_pct numeric not null default 0,
  tasa_estadistica_tope_usd numeric not null default 150,
  iva_general_pct numeric not null default 21,
  iva_pct_reducido numeric not null default 10.5,
  iva_adicional_pct numeric not null default 0,
  anticipo_ganancias_pct numeric not null default 0,
  iibb_pct numeric not null default 0,
  honorarios_despachante_pct numeric not null default 1,
  honorarios_despachante_minimo_usd numeric not null default 450,
  tc_usd_ars numeric not null default 0,
  gastos_bancarios_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table parametros_globales is
  'Tabla append-only: NUNCA se hace UPDATE sobre filas existentes. Cada cambio de parámetros se inserta como nueva fila. Las carpetas fijan parametros_snapshot_id al crearse y no debe modificarse luego.';

-- ---------------------------------------------------------------------
-- PROVEEDORES
-- ---------------------------------------------------------------------
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  pais text not null default 'China',
  contacto text,
  moneda_pago text not null default 'USD',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CONTENEDORES
-- ---------------------------------------------------------------------
create table contenedores (
  id uuid primary key default gen_random_uuid(),
  numero_contenedor text,
  tipo tipo_contenedor not null default 'FCL_40',
  naviera text,
  bl_number text,
  fecha_zarpe date,
  eta_contenedor date,
  estado_contenedor text,
  observaciones text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CARPETAS
-- ---------------------------------------------------------------------
create table carpetas (
  id uuid primary key default gen_random_uuid(),
  numero_carpeta text not null unique,
  proveedor_id uuid references proveedores(id),
  incoterm text not null default 'FOB',
  moneda text not null default 'USD',
  fob_total_usd numeric not null default 0,
  cbm_total numeric,
  peso_total_kg numeric,
  ncm text,
  parametros_snapshot_id uuid not null references parametros_globales(id),
  tc_snapshot numeric not null,
  contenedor_id uuid references contenedores(id),
  estado estado_carpeta not null default 'simulacion',
  fecha_pago_anticipo date,
  fecha_pago_saldo date,
  fecha_embarque date,
  eta date,
  fecha_arribo_real date,
  fecha_liberacion date,
  fecha_llegada_oficina date,
  pct_anticipo numeric not null default 30,
  pct_saldo numeric not null default 70,
  monto_anticipo_usd numeric,
  monto_saldo_usd numeric,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on column carpetas.parametros_snapshot_id is
  'Fijado al crear la carpeta. Por convención de la aplicación nunca debe modificarse luego (no hay trigger que lo bloquee, se confía en la capa de aplicación).';

-- ---------------------------------------------------------------------
-- SKUS
-- ---------------------------------------------------------------------
create table skus (
  id uuid primary key default gen_random_uuid(),
  carpeta_id uuid not null references carpetas(id) on delete cascade,
  codigo_sku text,
  descripcion text,
  cantidad numeric not null default 0,
  precio_unitario_fob_usd numeric not null default 0,
  peso_kg numeric,
  cbm numeric,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- COSTOS
-- ---------------------------------------------------------------------
create table costos (
  id uuid primary key default gen_random_uuid(),
  carpeta_id uuid references carpetas(id) on delete cascade,
  contenedor_id uuid references contenedores(id) on delete cascade,
  nivel nivel_costo not null,
  concepto text not null,
  categoria categoria_costo not null,
  origen origen_costo not null default 'manual',
  monto_estimado_usd numeric not null default 0,
  monto_real_usd numeric,
  tc_aplicado numeric,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint costos_nivel_fk_check check (
    (nivel = 'carpeta' and carpeta_id is not null) or
    (nivel = 'contenedor' and contenedor_id is not null)
  )
);

-- ---------------------------------------------------------------------
-- CRITERIOS_PRORRATEO
-- ---------------------------------------------------------------------
create table criterios_prorrateo (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  costo_id uuid not null references costos(id) on delete cascade,
  criterio criterio_prorrateo_tipo not null default 'cbm',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- INDICES
-- ---------------------------------------------------------------------
create index idx_carpetas_proveedor_id on carpetas(proveedor_id);
create index idx_carpetas_contenedor_id on carpetas(contenedor_id);
create index idx_carpetas_parametros_snapshot_id on carpetas(parametros_snapshot_id);
create index idx_carpetas_numero_carpeta on carpetas(numero_carpeta);
create index idx_carpetas_estado on carpetas(estado);
create index idx_carpetas_fecha_embarque on carpetas(fecha_embarque);
create index idx_carpetas_eta on carpetas(eta);

create index idx_skus_carpeta_id on skus(carpeta_id);

create index idx_costos_carpeta_id on costos(carpeta_id);
create index idx_costos_contenedor_id on costos(contenedor_id);

create index idx_criterios_prorrateo_contenedor_id on criterios_prorrateo(contenedor_id);
create index idx_criterios_prorrateo_costo_id on criterios_prorrateo(costo_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table profiles enable row level security;
alter table parametros_globales enable row level security;
alter table proveedores enable row level security;
alter table contenedores enable row level security;
alter table carpetas enable row level security;
alter table skus enable row level security;
alter table costos enable row level security;
alter table criterios_prorrateo enable row level security;

-- ---------------------------------------------------------------------
-- PROFILES policies
-- Sin recursión: cada usuario puede ver su propia fila sin pasar por current_user_rol().
-- Admins ven todo gracias a la segunda policy que lee directamente la columna rol.
-- ---------------------------------------------------------------------
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid());

create policy "profiles_select_all_if_admin" on profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

create policy "profiles_insert_admin" on profiles
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

create policy "profiles_update_admin" on profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

create policy "profiles_delete_admin" on profiles
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

-- ---------------------------------------------------------------------
-- PARAMETROS_GLOBALES: admin todo, operador/viewer solo SELECT, nadie hace UPDATE/DELETE salvo admin
-- ---------------------------------------------------------------------
create policy "parametros_globales_select_all" on parametros_globales
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "parametros_globales_insert_admin" on parametros_globales
  for insert with check (public.current_user_rol() = 'admin');

create policy "parametros_globales_update_admin" on parametros_globales
  for update using (public.current_user_rol() = 'admin');

create policy "parametros_globales_delete_admin" on parametros_globales
  for delete using (public.current_user_rol() = 'admin');

-- ---------------------------------------------------------------------
-- Helper pattern para tablas operativas:
-- admin: all; operador: select/insert/update; viewer: select only; delete: admin only
-- ---------------------------------------------------------------------

-- PROVEEDORES
create policy "proveedores_select" on proveedores
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));
create policy "proveedores_insert" on proveedores
  for insert with check (public.current_user_rol() in ('admin', 'operador'));
create policy "proveedores_update" on proveedores
  for update using (public.current_user_rol() in ('admin', 'operador'));
create policy "proveedores_delete" on proveedores
  for delete using (public.current_user_rol() = 'admin');

-- CONTENEDORES
create policy "contenedores_select" on contenedores
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));
create policy "contenedores_insert" on contenedores
  for insert with check (public.current_user_rol() in ('admin', 'operador'));
create policy "contenedores_update" on contenedores
  for update using (public.current_user_rol() in ('admin', 'operador'));
create policy "contenedores_delete" on contenedores
  for delete using (public.current_user_rol() = 'admin');

-- CARPETAS
create policy "carpetas_select" on carpetas
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));
create policy "carpetas_insert" on carpetas
  for insert with check (public.current_user_rol() in ('admin', 'operador'));
create policy "carpetas_update" on carpetas
  for update using (public.current_user_rol() in ('admin', 'operador'));
create policy "carpetas_delete" on carpetas
  for delete using (public.current_user_rol() = 'admin');

-- SKUS
create policy "skus_select" on skus
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));
create policy "skus_insert" on skus
  for insert with check (public.current_user_rol() in ('admin', 'operador'));
create policy "skus_update" on skus
  for update using (public.current_user_rol() in ('admin', 'operador'));
create policy "skus_delete" on skus
  for delete using (public.current_user_rol() = 'admin');

-- COSTOS
create policy "costos_select" on costos
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));
create policy "costos_insert" on costos
  for insert with check (public.current_user_rol() in ('admin', 'operador'));
create policy "costos_update" on costos
  for update using (public.current_user_rol() in ('admin', 'operador'));
create policy "costos_delete" on costos
  for delete using (public.current_user_rol() = 'admin');

-- CRITERIOS_PRORRATEO
create policy "criterios_prorrateo_select" on criterios_prorrateo
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));
create policy "criterios_prorrateo_insert" on criterios_prorrateo
  for insert with check (public.current_user_rol() in ('admin', 'operador'));
create policy "criterios_prorrateo_update" on criterios_prorrateo
  for update using (public.current_user_rol() in ('admin', 'operador'));
create policy "criterios_prorrateo_delete" on criterios_prorrateo
  for delete using (public.current_user_rol() = 'admin');

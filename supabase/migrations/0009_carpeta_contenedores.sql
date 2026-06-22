-- 0009_carpeta_contenedores.sql
-- Permite que una carpeta (compra/factura) se reparta entre varios contenedores,
-- cada uno con su porción de CBM. Reemplaza el uso de carpetas.contenedor_id
-- (que se deja en la tabla sin usar, por compatibilidad histórica).

create table if not exists carpeta_contenedores (
  id uuid primary key default gen_random_uuid(),
  carpeta_id uuid not null references carpetas(id) on delete cascade,
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  cbm_asignado numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (carpeta_id, contenedor_id)
);

create index if not exists carpeta_contenedores_carpeta_idx on carpeta_contenedores(carpeta_id);
create index if not exists carpeta_contenedores_contenedor_idx on carpeta_contenedores(contenedor_id);

-- Backfill: las carpetas que ya tenían un contenedor asignado (1:1) pasan a tener
-- una fila en la tabla nueva con el CBM total de la carpeta.
insert into carpeta_contenedores (carpeta_id, contenedor_id, cbm_asignado)
select id, contenedor_id, coalesce(cbm_total, 0)
from carpetas
where contenedor_id is not null
on conflict (carpeta_id, contenedor_id) do nothing;

alter table carpeta_contenedores enable row level security;

create policy "carpeta_contenedores_select" on carpeta_contenedores
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "carpeta_contenedores_insert" on carpeta_contenedores
  for insert with check (public.current_user_rol() in ('admin', 'operador'));

create policy "carpeta_contenedores_update" on carpeta_contenedores
  for update using (public.current_user_rol() in ('admin', 'operador'));

create policy "carpeta_contenedores_delete" on carpeta_contenedores
  for delete using (public.current_user_rol() in ('admin', 'operador'));

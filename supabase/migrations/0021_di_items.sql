-- Asignación del Despacho de Importación (DI) a carpetas y SKUs. Reemplaza
-- el matching automático por NCM (sincronizarCostosSkuDesdeDespacho /
-- sincronizarAntiDumping en contenedores/[id]/documentos/actions.ts) por un
-- flujo de asignación asistido por IA con revisión manual obligatoria.

create table di_items (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid references contenedores(id) on delete cascade,
  documento_id uuid references documentos(id) on delete cascade,
  numero_item text not null,
  descripcion_di text,
  ncm text,
  fob_usd numeric default 0,
  derechos_usd numeric default 0,
  tasa_estadistica_usd numeric default 0,
  antidumping_usd numeric default 0,
  iva_usd numeric default 0,
  carpeta_id uuid references carpetas(id) on delete set null,
  confianza numeric,
  razon text,
  confirmado boolean default false,
  created_at timestamptz default now()
);

create table di_item_skus (
  id uuid primary key default gen_random_uuid(),
  di_item_id uuid references di_items(id) on delete cascade,
  carpeta_id uuid references carpetas(id) on delete cascade,
  sku_id uuid references skus(id) on delete cascade,
  proporcion_fob numeric default 1
);

create index di_items_contenedor_id_idx on di_items(contenedor_id);
create index di_item_skus_di_item_id_idx on di_item_skus(di_item_id);

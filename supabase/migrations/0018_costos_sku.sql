-- 0018_costos_sku.sql
-- Tributos reales por SKU individual, calculados al confirmar un despacho de
-- aduana: cada ítem NCM de la declaración (con sus conceptos: derechos, tasa
-- estadística, IVA, antidumping, etc.) se matchea contra los SKUs cuyo NCM
-- coincide (primeros 8 dígitos) y se prorratea por FOB entre ellos. Esto
-- reemplaza, solo para estos conceptos, el reparto uniforme por FOB/CBM a
-- nivel de toda la carpeta — necesario porque dentro de una misma carpeta
-- puede haber NCMs con tasas y antidumping distintos (ej. EPP: guantes de
-- cuero con antidumping vs. anteojos sin antidumping).

create table costos_sku (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references skus(id) on delete cascade,
  documento_id uuid not null references documentos(id) on delete cascade,
  concepto text not null,
  monto_real_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

create index costos_sku_sku_id_idx on costos_sku(sku_id);
create index costos_sku_documento_id_idx on costos_sku(documento_id);

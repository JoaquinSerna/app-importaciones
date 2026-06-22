-- 0010_skus_ncm.sql
-- Permite asignar un NCM distinto a cada SKU de una carpeta. La cascada de
-- impuestos de la carpeta se recalcula como promedio ponderado por FOB de
-- los NCM de sus SKUs (ver lib/calculadora-costos.ts: calcularArancelPonderado).

alter table skus add column if not exists ncm_id uuid references ncm_aranceles(id);

create index if not exists skus_ncm_idx on skus(ncm_id);

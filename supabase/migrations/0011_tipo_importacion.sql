-- 0011_tipo_importacion.sql
-- Bien de uso solo paga derechos de importación + IVA (no IVA adicional,
-- ni anticipo de ganancias, ni IIBB, ni tasa estadística). Bien de cambio
-- paga todo lo que tenga configurado el NCM.

alter table carpetas add column if not exists tipo_importacion text not null default 'bien_de_cambio';

alter table carpetas drop constraint if exists carpetas_tipo_importacion_check;
alter table carpetas add constraint carpetas_tipo_importacion_check
  check (tipo_importacion in ('bien_de_cambio', 'bien_de_uso'));

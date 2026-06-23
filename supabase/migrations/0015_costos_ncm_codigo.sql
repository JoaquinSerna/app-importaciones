-- 0015_costos_ncm_codigo.sql
-- Tributos específicos de un NCM puntual (derechos anti-dumping, salvaguardias,
-- etc.) no deben repartirse entre todos los SKUs de la carpeta — solo afectan
-- a los SKUs que tienen ESE NCM. Este campo permite identificarlos.

alter table costos add column if not exists ncm_codigo text;
create index if not exists costos_ncm_codigo_idx on costos(ncm_codigo);

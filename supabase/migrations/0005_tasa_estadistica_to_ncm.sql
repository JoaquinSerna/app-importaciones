-- Quitar tasa_estadistica de parametros_globales
alter table parametros_globales
  drop column if exists tasa_estadistica_pct,
  drop column if exists tasa_estadistica_tope_usd;

-- Agregar tasa_estadistica_pct a ncm_aranceles (ya tiene aplica_tasa_estadistica)
alter table ncm_aranceles
  add column if not exists tasa_estadistica_pct numeric not null default 3;

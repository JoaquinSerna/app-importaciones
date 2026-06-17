-- Agrega aplica_tasa_estadistica a ncm_aranceles
-- La tasa estadística (% y tope) sigue siendo global en parametros_globales,
-- pero si aplica o no depende del NCM.
alter table ncm_aranceles
  add column aplica_tasa_estadistica boolean not null default true;

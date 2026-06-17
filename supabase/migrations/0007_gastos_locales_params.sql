-- Nuevos parámetros: costos antes del CIF y gastos locales post-aduana
alter table parametros_globales
  add column if not exists peak_season_usd         numeric not null default 0,
  add column if not exists thc_usd                 numeric not null default 0,
  add column if not exists toll_importacion_usd    numeric not null default 0,
  add column if not exists digitalizacion_usd      numeric not null default 0,
  add column if not exists gastos_operativos_usd   numeric not null default 0,
  add column if not exists tramitaciones_usd       numeric not null default 0;

-- gasto_terminal_usd se reutiliza como "depósito fiscal por contenedor" (ya existe, no se crea)

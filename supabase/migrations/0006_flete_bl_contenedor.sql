-- 1. Flete internacional como referencia en parámetros globales
alter table parametros_globales
  add column if not exists flete_internacional_usd numeric not null default 0;

-- 2. BL number va en la carpeta, no en el contenedor
alter table carpetas
  add column if not exists bl_number text;

-- 3. Número de contenedor único (permite múltiples NULL, solo unicidad en valores no nulos)
create unique index if not exists contenedores_numero_contenedor_unique
  on contenedores (numero_contenedor)
  where numero_contenedor is not null;

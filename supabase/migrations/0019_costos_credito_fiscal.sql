-- El IVA de la factura naviera y del despachante es crédito fiscal
-- recuperable, no un costo real de la importación. Se guarda pero se
-- excluye de los totales de costo real.
alter table costos add column if not exists es_credito_fiscal boolean not null default false;

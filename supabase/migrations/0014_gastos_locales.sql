-- 0014_gastos_locales.sql
-- "Gastos locales" es un concepto distinto de "Gastos operativos" en las
-- facturas logísticas reales (ambos aparecen como líneas separadas). Sin un
-- concepto simulado propio, los dos terminaban matcheando contra el mismo
-- "Gastos operativos", pisándose entre sí.

alter table parametros_globales add column if not exists gastos_locales_usd numeric not null default 0;

-- 0024_skus_ncm_origen.sql
-- Trazabilidad de dónde salió el NCM asignado a un SKU: clasificación
-- automática (IA) al crear la carpeta, carga manual, o confirmado por el
-- despacho de importación real. null = todavía sin clasificar (se está
-- usando el arancel default provisorio para simular, ver lib/ncm-defaults.ts).

alter table skus add column if not exists ncm_origen text;

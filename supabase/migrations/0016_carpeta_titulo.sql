-- 0016_carpeta_titulo.sql
-- Título descriptivo corto de la carpeta (ej: "Cascos de seguridad"), para
-- poder identificarla a simple vista además del proveedor.

alter table carpetas add column if not exists titulo text;

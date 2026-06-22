-- 0012_ncm_aplica_siempre.sql
-- Las alícuotas de NCM ahora se cargan siempre completas (sin checkbox
-- condicional); qué se cobra realmente lo decide tipo_importacion en la
-- carpeta (bien de uso vs. bien de cambio). Normalizamos los NCM existentes.

update ncm_aranceles set
  aplica_iva_adicional = true,
  aplica_anticipo_ganancias = true,
  aplica_iibb = true,
  aplica_tasa_estadistica = true;

-- 0013_origen_costo_real.sql
-- Costos detectados automáticamente en documentos reales (Sección 3) que no
-- tienen equivalente en la simulación, para diferenciarlos de los manuales.

alter type origen_costo add value if not exists 'real';

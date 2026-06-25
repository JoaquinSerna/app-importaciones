-- Guarda la traducción al español del nombre del SKU por separado del
-- nombre original (que suele venir en inglés/chino del proveedor), para
-- poder mostrar ambos en la tab SKUs sin perder la referencia original.
alter table skus add column if not exists descripcion_es text;

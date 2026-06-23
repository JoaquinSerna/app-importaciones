-- 0017_skus_paga_dumping.sql
-- En vez de que la IA adivine por ítem del despacho a qué NCM aplica un
-- derecho anti-dumping (poco confiable), el usuario marca directamente en
-- la carpeta qué SKUs lo pagan. El monto total (del despacho) se prorratea
-- por FOB solo entre los SKUs marcados.

alter table skus add column if not exists paga_dumping boolean not null default false;

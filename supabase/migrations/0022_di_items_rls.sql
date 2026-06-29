-- di_items y di_item_skus quedaron con RLS habilitado sin políticas (la
-- 0021 no las agregó), por lo que cualquier insert/update fallaba con
-- "new row violates row-level security policy" sin importar el rol del
-- usuario. Mismo esquema de permisos que carpeta_contenedores.

alter table di_items enable row level security;

create policy "di_items_select" on di_items
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "di_items_insert" on di_items
  for insert with check (public.current_user_rol() in ('admin', 'operador'));

create policy "di_items_update" on di_items
  for update using (public.current_user_rol() in ('admin', 'operador'));

create policy "di_items_delete" on di_items
  for delete using (public.current_user_rol() in ('admin', 'operador'));

alter table di_item_skus enable row level security;

create policy "di_item_skus_select" on di_item_skus
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "di_item_skus_insert" on di_item_skus
  for insert with check (public.current_user_rol() in ('admin', 'operador'));

create policy "di_item_skus_update" on di_item_skus
  for update using (public.current_user_rol() in ('admin', 'operador'));

create policy "di_item_skus_delete" on di_item_skus
  for delete using (public.current_user_rol() in ('admin', 'operador'));

-- costos_sku (0018) tiene el mismo problema potencial: nunca se le agregaron
-- políticas. La escribe confirmarAsignacionDI sin chequear errores, así que
-- si RLS está habilitado ahí también, fallaría en silencio igual que di_items.
alter table costos_sku enable row level security;

create policy "costos_sku_select" on costos_sku
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "costos_sku_insert" on costos_sku
  for insert with check (public.current_user_rol() in ('admin', 'operador'));

create policy "costos_sku_update" on costos_sku
  for update using (public.current_user_rol() in ('admin', 'operador'));

create policy "costos_sku_delete" on costos_sku
  for delete using (public.current_user_rol() in ('admin', 'operador'));

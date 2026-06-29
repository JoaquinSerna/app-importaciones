-- Registra cada vez que el comprador corrige a mano la asignación que
-- propuso la IA en confirmarAsignacionDI, para usarlas como contexto en el
-- prompt de asignarItemsDI y mejorar futuras propuestas.

create table di_aprendizaje (
  id uuid primary key default gen_random_uuid(),
  descripcion_di text,
  ncm text,
  carpeta_titulo text,
  sku_descripcion text,
  confianza_original numeric,
  corregido_manualmente boolean default true,
  created_at timestamptz default now()
);

alter table di_aprendizaje enable row level security;

create policy "di_aprendizaje_select" on di_aprendizaje
  for select using (public.current_user_rol() in ('admin', 'operador', 'viewer'));

create policy "di_aprendizaje_insert" on di_aprendizaje
  for insert with check (public.current_user_rol() in ('admin', 'operador'));

-- Fechas en carpetas
alter table carpetas
  add column if not exists fecha_salida_estimada   date,
  add column if not exists fecha_arribo_estimada   date,
  add column if not exists fecha_salida_real        date,
  add column if not exists fecha_arribo_real        date,
  add column if not exists fecha_pago_anticipo      date,
  add column if not exists fecha_pago_saldo         date,
  add column if not exists monto_pago_anticipo_usd  numeric,
  add column if not exists monto_pago_saldo_usd     numeric;

-- Tipos de documento válidos
create type tipo_documento as enum (
  -- Carpeta: sección 1 (proveedor)
  'foto_contacto',
  'proforma_invoice',
  'packing_list',
  'commercial_invoice',
  -- Carpeta: sección 2 (pagos proveedor)
  'instruccion_transferencia_anticipo',
  'instruccion_transferencia_saldo',
  'comprobante_pago_anticipo',
  'comprobante_pago_saldo',
  -- Contenedor: sección 3 (operación aduanera)
  'saf',
  'comprobante_pago_saf',
  'factura_logistica',
  'comprobante_pago_logistica',
  'factura_despachante',
  'comprobante_pago_despachante',
  'despacho_aduana'
);

-- Estado de extracción IA
create type estado_extraccion as enum (
  'sin_procesar',
  'procesando',
  'extraido',
  'error'
);

-- Tabla central de documentos
create table if not exists documentos (
  id              uuid primary key default gen_random_uuid(),
  -- Pertenece a carpeta O a contenedor (nunca ambos)
  carpeta_id      uuid references carpetas(id)     on delete cascade,
  contenedor_id   uuid references contenedores(id) on delete cascade,
  tipo            tipo_documento not null,
  file_name       text not null,
  file_url        text not null,          -- URL en Supabase Storage
  estado          estado_extraccion not null default 'sin_procesar',
  datos_extraidos jsonb,                  -- JSON libre con lo que extrajo la IA
  notas           text,                   -- observaciones manuales o errores
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  constraint documento_scope check (
    (carpeta_id is not null and contenedor_id is null) or
    (carpeta_id is null and contenedor_id is not null)
  )
);

-- Índices
create index if not exists documentos_carpeta_idx    on documentos(carpeta_id);
create index if not exists documentos_contenedor_idx on documentos(contenedor_id);
create index if not exists documentos_tipo_idx       on documentos(tipo);

-- RLS
alter table documentos enable row level security;

create policy "documentos_select" on documentos
  for select using (auth.role() = 'authenticated');

create policy "documentos_insert" on documentos
  for insert with check (auth.role() = 'authenticated');

create policy "documentos_update" on documentos
  for update using (auth.role() = 'authenticated');

create policy "documentos_delete" on documentos
  for delete using (
    auth.role() = 'authenticated' and
    public.current_user_rol() = 'admin'
  );

import { notFound } from "next/navigation";

import { DiAsignacionEditor } from "@/components/contenedores/DiAsignacionEditor";
import { createClient } from "@/lib/supabase/server";
import type { Contenedor } from "@/lib/types";

export default async function DiAsignacionPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: contenedor } = await supabase.from("contenedores").select("*").eq("id", params.id).single();
  if (!contenedor) notFound();

  const [{ data: diItems }, { data: asignacionesCarpeta }] = await Promise.all([
    supabase.from("di_items").select("*").eq("contenedor_id", params.id).order("numero_item", { ascending: true }),
    supabase
      .from("carpeta_contenedores")
      .select("carpeta_id, carpetas(id, titulo, numero_carpeta, skus(id, descripcion, descripcion_es))")
      .eq("contenedor_id", params.id),
  ]);

  const { data: diItemSkus } = await supabase
    .from("di_item_skus")
    .select("di_item_id, sku_id")
    .in("di_item_id", (diItems ?? []).map((it) => it.id));

  type CarpetaConSkus = {
    id: string;
    titulo: string | null;
    numero_carpeta: string;
    skus: { id: string; descripcion: string | null; descripcion_es: string | null }[];
  };

  const carpetas = (asignacionesCarpeta ?? [])
    .map((a) => a.carpetas as unknown as CarpetaConSkus | null)
    .filter((c): c is CarpetaConSkus => !!c);

  const skuIdsPorDiItem = new Map<string, string[]>();
  for (const row of diItemSkus ?? []) {
    const lista = skuIdsPorDiItem.get(row.di_item_id) ?? [];
    lista.push(row.sku_id);
    skuIdsPorDiItem.set(row.di_item_id, lista);
  }

  const items = (diItems ?? []).map((it) => ({
    ...it,
    sku_ids_asignados: skuIdsPorDiItem.get(it.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asignación del Despacho de Importación</h1>
        <p className="text-muted-foreground">
          Revisá que cada ítem del DI esté asignado a la carpeta y SKU correcto.
        </p>
      </div>
      <DiAsignacionEditor
        contenedorId={params.id}
        contenedorNumero={(contenedor as Contenedor).numero_contenedor ?? "(sin número)"}
        items={items}
        carpetas={carpetas}
      />
    </div>
  );
}

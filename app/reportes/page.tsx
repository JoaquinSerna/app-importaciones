import { ReportesSelector } from "@/components/reportes/ReportesSelector";
import type { CarpetaReporteData } from "@/components/reportes/ExportarPdfButton";
import { createClient } from "@/lib/supabase/server";
import type { Carpeta, Costo, Sku } from "@/lib/types";

export default async function ReportesPage() {
  const supabase = createClient();

  const { data: carpetasRaw } = await supabase
    .from("carpetas")
    .select("*, proveedores(nombre), costos(*), skus(*)")
    .order("created_at", { ascending: false });

  const carpetasData: CarpetaReporteData[] = (carpetasRaw ?? []).map(
    (
      c: Carpeta & {
        proveedores?: { nombre: string } | null;
        costos?: Costo[];
        skus?: Sku[];
      }
    ) => ({
      carpeta: c,
      proveedorNombre: c.proveedores?.nombre ?? null,
      costos: c.costos ?? [],
      skus: c.skus ?? [],
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-muted-foreground">
          Exportá reportes por carpeta y compará FOB, CIF estimado, costo real y días totales.
        </p>
      </div>
      <ReportesSelector carpetasData={carpetasData} />
    </div>
  );
}

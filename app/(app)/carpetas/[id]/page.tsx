import { notFound } from "next/navigation";

import { obtenerUrlDescarga } from "@/app/actions/storage";
import { BlEditor } from "@/components/carpetas/BlEditor";
import { ContenedoresMultiSelector } from "@/components/carpetas/ContenedoresMultiSelector";
import { CostosTable } from "@/components/carpetas/CostosTable";
import { Documentos } from "@/components/carpetas/Documentos";
import { SeccionComparacion } from "@/components/carpetas/SeccionComparacion";
import { SkusTable } from "@/components/carpetas/SkusTable";
import { Timeline } from "@/components/carpetas/Timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calcularCascada } from "@/lib/calculadora-costos";
import { createClient } from "@/lib/supabase/server";
import type { Carpeta, Costo, Documento, ParametrosGlobales, Sku } from "@/lib/types";

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatFecha(fecha: string | null) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-AR");
}

export default async function CarpetaDetallePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: carpeta } = await supabase
    .from("carpetas")
    .select("*, proveedores(nombre, foto_url)")
    .eq("id", params.id)
    .single();

  if (!carpeta) {
    notFound();
  }

  const [{ data: skus }, { data: costos }, { data: parametrosSnapshot }, { data: documentos }, { data: contenedores }, { data: comparacionItems }, { data: asignacionesContenedor }] = await Promise.all([
    supabase.from("skus").select("*").eq("carpeta_id", params.id),
    supabase.from("costos").select("*").eq("carpeta_id", params.id).order("created_at"),
    supabase
      .from("parametros_globales")
      .select("*")
      .eq("id", (carpeta as Carpeta).parametros_snapshot_id)
      .single(),
    supabase.from("documentos").select("*").eq("carpeta_id", params.id).order("created_at"),
    supabase.from("contenedores").select("id, numero_contenedor, tipo").order("numero_contenedor"),
    supabase.from("comparacion_items").select("*").eq("carpeta_id", params.id).order("created_at"),
    supabase.from("carpeta_contenedores").select("contenedor_id, cbm_asignado").eq("carpeta_id", params.id),
  ]);

  const skusList = (skus ?? []) as Sku[];
  const costosList = (costos ?? []) as Costo[];
  const carpetaTyped = carpeta as Carpeta & { proveedores?: { nombre: string; foto_url: string | null } | null };

  const fotoUrlOriginal = carpetaTyped.proveedores?.foto_url ?? null;
  const proveedorFotoUrl = fotoUrlOriginal ? await obtenerUrlDescarga(fotoUrlOriginal) : null;

  let cifEstimado: number | null = null;
  if (parametrosSnapshot) {
    const cascada = calcularCascada(parametrosSnapshot as ParametrosGlobales, {
      fobTotalUsd: carpetaTyped.fob_total_usd,
      cbmTotal: carpetaTyped.cbm_total ?? undefined,
      pesoTotalKg: carpetaTyped.peso_total_kg ?? undefined,
    });
    cifEstimado = cascada.cif;
  }

  const totalCostosUsd = costosList.reduce((acc, c) => acc + c.monto_estimado_usd, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{carpetaTyped.numero_carpeta}</h1>
          <p className="text-muted-foreground">{carpetaTyped.proveedores?.nombre ?? "Sin proveedor"}</p>
        </div>
        <Badge variant="secondary" className="capitalize">
          {carpetaTyped.estado.replace("_", " ")}
        </Badge>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="skus">SKUs</TabsTrigger>
          <TabsTrigger value="costos">Costos</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="comparacion">Sección 3</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">FOB</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {formatUsd(carpetaTyped.fob_total_usd)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">CIF estimado</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {cifEstimado !== null ? formatUsd(cifEstimado) : "-"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Estado</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold capitalize">
                {carpetaTyped.estado.replace("_", " ")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">ETA</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">{formatFecha(carpetaTyped.eta)}</CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Contenedor(es)</CardTitle>
            </CardHeader>
            <CardContent>
              <ContenedoresMultiSelector
                carpetaId={carpetaTyped.id}
                cbmTotalCarpeta={carpetaTyped.cbm_total ?? 0}
                asignacionesActuales={(asignacionesContenedor ?? []).map((a) => ({
                  contenedorId: a.contenedor_id,
                  cbm: a.cbm_asignado,
                }))}
                contenedores={(contenedores ?? []) as { id: string; numero_contenedor: string | null; tipo: string }[]}
              />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Despacho</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <span className="text-muted-foreground mr-2">BL:</span>
              <BlEditor carpetaId={carpetaTyped.id} blActual={carpetaTyped.bl_number} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Fechas clave</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>Pago anticipo: {formatFecha(carpetaTyped.fecha_pago_anticipo)}</div>
              <div>Pago saldo: {formatFecha(carpetaTyped.fecha_pago_saldo)}</div>
              <div>Embarque: {formatFecha(carpetaTyped.fecha_embarque)}</div>
              <div>Arribo real: {formatFecha(carpetaTyped.fecha_arribo_real)}</div>
              <div>Liberación: {formatFecha(carpetaTyped.fecha_liberacion)}</div>
              <div>Llegada a oficina: {formatFecha(carpetaTyped.fecha_llegada_oficina)}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skus">
          <SkusTable skus={skusList} totalCostosUsd={totalCostosUsd} />
        </TabsContent>

        <TabsContent value="costos">
          <CostosTable carpetaId={carpetaTyped.id} costos={costosList} />
        </TabsContent>

        <TabsContent value="timeline">
          <Timeline carpeta={carpetaTyped} />
        </TabsContent>

        <TabsContent value="documentos">
          <Documentos
            carpetaId={carpetaTyped.id}
            documentos={(documentos ?? []) as Documento[]}
            proveedorFotoUrl={proveedorFotoUrl}
          />
        </TabsContent>

        <TabsContent value="comparacion">
          <SeccionComparacion
            carpetaId={carpetaTyped.id}
            comparacionGuardada={(comparacionItems ?? []) as {
              concepto_real: string;
              concepto_simulado: string | null;
              monto_real_usd: number;
              monto_simulado_usd: number | null;
              fuente: string;
              es_nuevo: boolean;
            }[]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

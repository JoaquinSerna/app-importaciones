"use client";

import { useRef, useTransition } from "react";
import { CheckCircle, Download, FileText, Loader2, Upload, XCircle } from "lucide-react";

import {
  eliminarDocumentoContenedor,
  subirDocumentoContenedor,
} from "@/app/(app)/contenedores/[id]/documentos/actions";
import { obtenerUrlDescarga } from "@/app/actions/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import type { Documento, TipoDocumento } from "@/lib/types";
import { RevisarItemsDespacho } from "./RevisarItemsDespacho";
import { RevisionMonedasDespacho } from "./RevisionMonedasDespacho";

interface SlotConfig {
  tipo: TipoDocumento;
  label: string;
  descripcion: string;
  extrae?: string[];
}

const SECCION_OPERACION: SlotConfig[] = [
  {
    tipo: "saf",
    label: "SAF (Servicio Almacenaje y Fiscalización)",
    descripcion: "PDF del SAF emitido por el despachante",
    extrae: ["numero_saf", "monto_total", "moneda", "despachante"],
  },
  {
    tipo: "comprobante_pago_saf",
    label: "Comprobante pago SAF",
    descripcion: "PDF o imagen del comprobante de pago del SAF",
    extrae: ["fecha", "monto", "moneda"],
  },
  {
    tipo: "factura_logistica",
    label: "Factura logística",
    descripcion: "PDF de la factura de la empresa logística (ej: ACW Cargo)",
    extrae: ["numero_factura", "emisor", "monto_total", "moneda"],
  },
  {
    tipo: "comprobante_pago_logistica",
    label: "Comprobante pago logística",
    descripcion: "PDF o imagen del comprobante de pago logístico",
    extrae: ["fecha", "monto", "moneda"],
  },
  {
    tipo: "factura_despachante",
    label: "Factura despachante",
    descripcion: "PDF de la factura de honorarios del despachante",
    extrae: ["numero_factura", "despachante", "monto_total", "moneda"],
  },
  {
    tipo: "comprobante_pago_despachante",
    label: "Comprobante pago despachante",
    descripcion: "PDF o imagen del comprobante de pago al despachante",
    extrae: ["fecha", "monto", "moneda"],
  },
  {
    tipo: "despacho_aduana",
    label: "Despacho de aduana",
    descripcion: "PDF del despacho de importación — se extraen tributos reales y NCM",
    extrae: ["numero_despacho", "fecha_oficializacion"],
  },
];

function fmtVal(key: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (key === "monto_total" || key === "monto") {
    return `${Number(val).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  }
  return String(val);
}

function fmtLabel(key: string): string {
  const MAP: Record<string, string> = {
    numero_saf: "N° SAF",
    monto_total: "Total",
    moneda: "Moneda",
    despachante: "Despachante",
    numero_factura: "N° Factura",
    emisor: "Emisor",
    fecha: "Fecha",
    monto: "Monto",
    numero_despacho: "N° Despacho",
    fecha_oficializacion: "Oficialización",
  };
  return MAP[key] ?? key;
}

function EstadoBadge({ estado }: { estado: Documento["estado"] }) {
  if (estado === "extraido")
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle className="h-3 w-3" />Extraído
      </span>
    );
  if (estado === "procesando")
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <Loader2 className="h-3 w-3 animate-spin" />Procesando…
      </span>
    );
  if (estado === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <XCircle className="h-3 w-3" />Error
      </span>
    );
  return <span className="text-xs text-muted-foreground">Sin procesar</span>;
}

function DocumentoSlot({
  slot,
  doc,
  contenedorId,
}: {
  slot: SlotConfig;
  doc: Documento | undefined;
  contenedorId: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      try {
        await subirDocumentoContenedor(contenedorId, slot.tipo, formData);
        toast({ title: `${slot.label} subido`, description: "Extracción IA completada." });
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  function handleEliminar() {
    if (!doc) return;
    startTransition(async () => {
      await eliminarDocumentoContenedor(contenedorId, doc.id);
    });
  }

  function handleDescargar() {
    if (!doc) return;
    startTransition(async () => {
      try {
        const url = await obtenerUrlDescarga(doc.file_url);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        toast({
          title: "Error al descargar",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div
        className={`mt-0.5 rounded-md p-2 ${doc ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
      >
        <FileText className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{slot.label}</p>
        {!doc ? (
          <p className="text-xs text-muted-foreground">{slot.descripcion}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
            <EstadoBadge estado={doc.estado} />
            {doc.estado === "extraido" && doc.datos_extraidos && slot.extrae && (
              <div className="mt-1 space-y-0.5">
                {slot.extrae.map((key) => {
                  const val = doc.datos_extraidos![key];
                  if (val === null || val === undefined) return null;
                  return (
                    <div key={key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{fmtLabel(key)}:</span>{" "}
                      {fmtVal(key, val)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {!doc ? (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            <span className="ml-1 hidden sm:inline">Subir</span>
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={isPending} onClick={handleDescargar} title="Descargar">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => inputRef.current?.click()}
              title="Reemplazar"
            >
              <Upload className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleEliminar}
              title="Eliminar"
            >
              <XCircle className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface NcmPorCarpeta {
  ncmCodigo: string;
  carpetaId: string;
  carpetaLabel: string;
}

interface DocumentosContenedorProps {
  contenedorId: string;
  documentos: Documento[];
  ncmPorCarpeta: NcmPorCarpeta[];
}

export function DocumentosContenedor({ contenedorId, documentos, ncmPorCarpeta }: DocumentosContenedorProps) {
  const byTipo = Object.fromEntries(documentos.map((d) => [d.tipo, d])) as Partial<
    Record<TipoDocumento, Documento>
  >;

  const despacho = byTipo["despacho_aduana"];
  const datosDespacho = despacho?.datos_extraidos as Record<string, unknown> | undefined;
  const itemsCostosRaw = datosDespacho?.items_costos as { concepto: string; monto: number }[] | undefined;
  const itemsVerificados = datosDespacho?.items_verificados === true;
  const itemsDespachoRaw = (datosDespacho?.items ?? []) as {
    item: number;
    ncm?: string;
    conceptos?: { concepto: string; monto: number }[];
  }[];
  const monedasConfirmadas = datosDespacho?.monedas_confirmadas === true;
  const itemsCostosConfirmados = datosDespacho?.items_costos_confirmados as
    | { concepto: string; monto: number; moneda: "USD" | "ARS"; monto_usd: number }[]
    | undefined;
  const tipoCambioInicial = (datosDespacho?.tipo_cambio as number | null) ?? null;
  const totalConfirmado = (itemsCostosConfirmados ?? []).reduce((a, i) => a + i.monto_usd, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sección 1 · Operación aduanera</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {SECCION_OPERACION.map((slot) => (
            <DocumentoSlot
              key={slot.tipo}
              slot={slot}
              doc={byTipo[slot.tipo]}
              contenedorId={contenedorId}
            />
          ))}
        </CardContent>
      </Card>

      {despacho && despacho.estado === "extraido" && !itemsVerificados && (
        <RevisarItemsDespacho
          documentoId={despacho.id}
          contenedorId={contenedorId}
          itemsIniciales={itemsDespachoRaw.map((it) => ({
            item: it.item,
            ncm: it.ncm ?? "",
            conceptos: it.conceptos ?? [],
          }))}
          ncmPorCarpeta={ncmPorCarpeta}
        />
      )}

      {despacho && itemsVerificados && itemsCostosRaw && itemsCostosRaw.length > 0 && !monedasConfirmadas && (
        <RevisionMonedasDespacho
          documentoId={despacho.id}
          contenedorId={contenedorId}
          itemsCostos={itemsCostosRaw}
          tipoCambioInicial={tipoCambioInicial}
        />
      )}

      {monedasConfirmadas && itemsCostosConfirmados && itemsCostosConfirmados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen costos reales (del despacho)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {itemsCostosConfirmados.map((item) => (
                <div key={item.concepto}>
                  <p className="text-xs text-muted-foreground">
                    {item.concepto} <span className="text-muted-foreground/60">({item.moneda})</span>
                  </p>
                  <p className="font-medium">
                    USD {item.monto_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-sm font-medium">Total</span>
              <span className="text-base font-bold">
                USD {totalConfirmado.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

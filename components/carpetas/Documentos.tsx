"use client";

import { useRef, useTransition } from "react";
import { CheckCircle, Download, FileText, Image, Loader2, Upload, UserCircle, XCircle } from "lucide-react";

import { eliminarDocumento, subirDocumento } from "@/app/(app)/carpetas/[id]/documentos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import type { Documento, TipoDocumento } from "@/lib/types";

interface SlotConfig {
  tipo: TipoDocumento;
  label: string;
  descripcion: string;
  acepta: string; // MIME types
  extrae?: string[]; // qué datos muestra una vez extraído
}

const SECCION_1: SlotConfig[] = [
  {
    tipo: "proforma_invoice",
    label: "Proforma Invoice",
    descripcion: "PDF de la proforma del proveedor",
    acepta: "application/pdf",
    extrae: ["fob_total", "proveedor", "fecha"],
  },
  {
    tipo: "packing_list",
    label: "Packing List",
    descripcion: "PDF del packing list — debe ser a nombre de PPO Projects",
    acepta: "application/pdf",
    extrae: ["cbm_total", "peso_bruto_total_kg", "destinatario_es_ppo"],
  },
  {
    tipo: "commercial_invoice",
    label: "Commercial Invoice",
    descripcion: "PDF de la commercial invoice — debe ser a nombre de PPO Projects",
    acepta: "application/pdf",
    extrae: ["fob_total", "destinatario_es_ppo", "fecha"],
  },
];

const SECCION_2: SlotConfig[] = [
  {
    tipo: "instruccion_transferencia_anticipo",
    label: "Instrucción transferencia anticipo",
    descripcion: "PDF de la instrucción de pago del anticipo (opcional)",
    acepta: "application/pdf",
    extrae: ["monto", "moneda", "beneficiario"],
  },
  {
    tipo: "instruccion_transferencia_saldo",
    label: "Instrucción transferencia saldo",
    descripcion: "PDF de la instrucción de pago del saldo (opcional)",
    acepta: "application/pdf",
    extrae: ["monto", "moneda", "beneficiario"],
  },
  {
    tipo: "comprobante_pago_anticipo",
    label: "Comprobante pago anticipo",
    descripcion: "PDF o imagen del comprobante de transferencia del anticipo",
    acepta: "application/pdf,image/*",
    extrae: ["monto", "moneda", "fecha"],
  },
  {
    tipo: "comprobante_pago_saldo",
    label: "Comprobante pago saldo",
    descripcion: "PDF o imagen del comprobante de transferencia del saldo",
    acepta: "application/pdf,image/*",
    extrae: ["monto", "moneda", "fecha"],
  },
];

function fmtExtraccion(key: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (key === "fob_total" || key === "monto") return `USD ${Number(val).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  if (key === "cbm_total") return `${val} m³`;
  if (key === "peso_bruto_total_kg") return `${Number(val).toLocaleString("es-AR")} kg`;
  if (key === "destinatario_es_ppo") return val ? "✓ PPO Projects" : "⚠ No es PPO Projects";
  return String(val);
}

function EstadoBadge({ estado }: { estado: Documento["estado"] }) {
  if (estado === "extraido") return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3 w-3" />Extraído</span>;
  if (estado === "procesando") return <span className="flex items-center gap-1 text-xs text-amber-600"><Loader2 className="h-3 w-3 animate-spin" />Procesando</span>;
  if (estado === "error") return <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="h-3 w-3" />Error</span>;
  return <span className="text-xs text-muted-foreground">Sin procesar</span>;
}

function DocumentoSlot({
  slot,
  doc,
  carpetaId,
}: {
  slot: SlotConfig;
  doc: Documento | undefined;
  carpetaId: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      try {
        await subirDocumento(carpetaId, slot.tipo, formData);
        toast({ title: `${slot.label} subido`, description: "Extracción IA completada." });
      } catch (err) {
        toast({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido", variant: "destructive" });
      }
    });
  }

  function handleEliminar() {
    if (!doc) return;
    startTransition(async () => {
      await eliminarDocumento(carpetaId, doc.id);
    });
  }

  const isImage = slot.acepta.startsWith("image");
  const Icon = isImage ? Image : FileText;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className={`mt-0.5 rounded-md p-2 ${doc ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
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
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                {slot.extrae.map((key) => (
                  <div key={key} className={`text-xs ${key === "destinatario_es_ppo" && doc.datos_extraidos![key] === false ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {fmtExtraccion(key, doc.datos_extraidos![key])}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept={slot.acepta}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {!doc ? (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => inputRef.current?.click()}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            <span className="ml-1 hidden sm:inline">Subir</span>
          </Button>
        ) : (
          <div className="flex gap-1">
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" download={doc.file_name}>
              <Button size="sm" variant="ghost" title="Descargar">
                <Download className="h-3 w-3" />
              </Button>
            </a>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => inputRef.current?.click()} title="Reemplazar">
              <Upload className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={handleEliminar} title="Eliminar">
              <XCircle className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface DocumentosProps {
  carpetaId: string;
  documentos: Documento[];
  proveedorFotoUrl?: string | null;
}

export function Documentos({ carpetaId, documentos, proveedorFotoUrl }: DocumentosProps) {
  const byTipo = Object.fromEntries(documentos.map((d) => [d.tipo, d])) as Partial<Record<TipoDocumento, Documento>>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sección 1 · Documentos del proveedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Foto del proveedor — se gestiona desde la página de Proveedores */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className={`mt-0.5 rounded-md p-2 ${proveedorFotoUrl ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              <Image className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Contacto del vendedor</p>
              {proveedorFotoUrl ? (
                <div className="mt-1 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proveedorFotoUrl} alt="Contacto" className="h-12 w-12 rounded object-cover border" />
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Cargada desde Proveedores
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Subí la foto en <strong>Proveedores</strong> y aparecerá acá automáticamente.
                </p>
              )}
            </div>
            {!proveedorFotoUrl && (
              <div className="shrink-0">
                <UserCircle className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
          </div>
          {SECCION_1.map((slot) => (
            <DocumentoSlot key={slot.tipo} slot={slot} doc={byTipo[slot.tipo]} carpetaId={carpetaId} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sección 2 · Pagos al proveedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {SECCION_2.map((slot) => (
            <DocumentoSlot key={slot.tipo} slot={slot} doc={byTipo[slot.tipo]} carpetaId={carpetaId} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { CheckCircle2, Circle, Pencil } from "lucide-react";

import { actualizarFechaCarpeta } from "@/app/(app)/carpetas/[id]/actions";
import { useToast } from "@/components/ui/use-toast";
import type { Carpeta } from "@/lib/types";

type CampoFecha =
  | "fecha_pago_anticipo"
  | "fecha_pago_saldo"
  | "fecha_embarque"
  | "eta"
  | "fecha_arribo_real"
  | "fecha_liberacion"
  | "fecha_llegada_oficina";

interface Hito {
  label: string;
  campo: CampoFecha;
  fecha: string | null;
  automatico?: boolean; // se carga sola desde documentos/contenedor
  tooltip?: string;
}

function formatFecha(fecha: string | null) {
  if (!fecha) return null;
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR");
}

function FechaEditor({
  hito,
  carpetaId,
}: {
  hito: Hito;
  carpetaId: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value || null;
    startTransition(async () => {
      try {
        const resultado = await actualizarFechaCarpeta(carpetaId, hito.campo, value);
        if (resultado.error) {
          toast({ title: "Error", description: resultado.error, variant: "destructive" });
        }
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  const cumplido = Boolean(hito.fecha);

  return (
    <li className="flex items-center gap-3 group">
      {cumplido ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <div className="flex flex-1 items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className={cumplido ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
            {hito.label}
          </span>
          {hito.automatico && (
            <span className="text-xs text-muted-foreground/60">
              {hito.tooltip ?? "Se carga automáticamente"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cumplido && (
            <span className="text-sm text-muted-foreground">{formatFecha(hito.fecha)}</span>
          )}
          {!hito.automatico && (
            <label className={`flex items-center gap-1 cursor-pointer rounded px-2 py-1 text-xs border transition-colors ${isPending ? "opacity-50" : "opacity-0 group-hover:opacity-100 hover:bg-muted"}`}>
              <Pencil className="h-3 w-3" />
              {cumplido ? "Editar" : "Cargar"}
              <input
                type="date"
                className="sr-only"
                value={hito.fecha?.slice(0, 10) ?? ""}
                onChange={handleChange}
                disabled={isPending}
              />
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

export function Timeline({ carpeta }: { carpeta: Carpeta }) {
  const hitos: Hito[] = [
    {
      label: "Pago de anticipo",
      campo: "fecha_pago_anticipo",
      fecha: carpeta.fecha_pago_anticipo,
      automatico: true,
      tooltip: "Se carga al subir el comprobante de pago anticipo",
    },
    {
      label: "Pago de saldo",
      campo: "fecha_pago_saldo",
      fecha: carpeta.fecha_pago_saldo,
      automatico: true,
      tooltip: "Se carga al subir el comprobante de pago saldo",
    },
    {
      label: "Embarque",
      campo: "fecha_embarque",
      fecha: carpeta.fecha_embarque,
      automatico: true,
      tooltip: "Se carga al asignar el contenedor",
    },
    {
      label: "ETA (estimado)",
      campo: "eta",
      fecha: carpeta.eta,
      automatico: true,
      tooltip: "Se carga al asignar el contenedor",
    },
    {
      label: "Arribo real",
      campo: "fecha_arribo_real",
      fecha: carpeta.fecha_arribo_real,
    },
    {
      label: "Liberación de aduana",
      campo: "fecha_liberacion",
      fecha: carpeta.fecha_liberacion,
    },
    {
      label: "Llegada a oficina",
      campo: "fecha_llegada_oficina",
      fecha: carpeta.fecha_llegada_oficina,
    },
  ];

  return (
    <ol className="space-y-3 max-w-lg">
      {hitos.map((hito) => (
        <FechaEditor key={hito.campo} hito={hito} carpetaId={carpeta.id} />
      ))}
    </ol>
  );
}

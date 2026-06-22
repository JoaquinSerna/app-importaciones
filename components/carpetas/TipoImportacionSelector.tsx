"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { actualizarTipoImportacion } from "@/app/(app)/carpetas/[id]/skus-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { TipoImportacion } from "@/lib/types";

const OPCIONES: { value: TipoImportacion; label: string }[] = [
  { value: "bien_de_cambio", label: "Bien de cambio (paga todo)" },
  { value: "bien_de_uso", label: "Bien de uso (solo derechos + IVA)" },
];

export function TipoImportacionSelector({
  carpetaId,
  tipoActual,
}: {
  carpetaId: string;
  tipoActual: TipoImportacion;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      const resultado = await actualizarTipoImportacion(carpetaId, value as TipoImportacion);
      if (resultado.error) {
        toast({ title: "No se pudo actualizar", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Costos recalculados" });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={tipoActual} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPCIONES.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { actualizarEstadoCarpeta } from "@/app/(app)/carpetas/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { EstadoCarpeta } from "@/lib/types";

const OPCIONES: { value: EstadoCarpeta; label: string }[] = [
  { value: "simulacion", label: "Simulación" },
  { value: "pre_embarque", label: "Pre-embarque" },
  { value: "en_transito", label: "En tránsito" },
  { value: "en_aduana", label: "En aduana" },
  { value: "finalizada", label: "Finalizada" },
];

export function EstadoCarpetaSelector({
  carpetaId,
  estadoActual,
}: {
  carpetaId: string;
  estadoActual: EstadoCarpeta;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      const resultado = await actualizarEstadoCarpeta(carpetaId, value as EstadoCarpeta);
      if (resultado.error) {
        toast({ title: "No se pudo actualizar", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Estado actualizado" });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={estadoActual} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-44 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPCIONES.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

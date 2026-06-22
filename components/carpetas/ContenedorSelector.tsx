"use client";

import { useTransition } from "react";
import { asignarContenedor } from "@/app/(app)/carpetas/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface Contenedor {
  id: string;
  numero_contenedor: string | null;
  tipo: string;
}

interface Props {
  carpetaId: string;
  contenedorIdActual: string | null;
  contenedores: Contenedor[];
}

export function ContenedorSelector({ carpetaId, contenedorIdActual, contenedores }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const newId = value === "ninguno" ? null : value;
    startTransition(async () => {
      try {
        const resultado = await asignarContenedor(carpetaId, newId);
        if (resultado.error) {
          toast({ title: "No se pudo asignar", description: resultado.error, variant: "destructive" });
          return;
        }
        toast({ title: "Contenedor actualizado" });
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Select
      value={contenedorIdActual ?? "ninguno"}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger className="w-full max-w-xs">
        <SelectValue placeholder="Sin contenedor" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ninguno">Sin contenedor</SelectItem>
        {contenedores.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            #{c.numero_contenedor ?? "—"} · {c.tipo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

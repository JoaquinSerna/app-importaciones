"use client";

import { useState, useTransition } from "react";
import { actualizarBlCarpeta } from "@/app/(app)/carpetas/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export function BlEditor({ carpetaId, blActual }: { carpetaId: string; blActual: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [bl, setBl] = useState(blActual ?? "");
  const [editando, setEditando] = useState(false);

  function handleGuardar() {
    startTransition(async () => {
      try {
        await actualizarBlCarpeta(carpetaId, bl);
        setEditando(false);
        toast({ title: "BL actualizado" });
      } catch (err) {
        toast({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido" });
      }
    });
  }

  if (!editando) {
    return (
      <span
        className="cursor-pointer underline decoration-dashed underline-offset-2 hover:text-foreground transition-colors"
        onClick={() => setEditando(true)}
        title="Clic para editar"
      >
        {bl || <span className="text-muted-foreground italic">Sin BL — clic para agregar</span>}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Input
        value={bl}
        onChange={(e) => setBl(e.target.value)}
        placeholder="Número de BL"
        className="h-7 text-sm w-48"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleGuardar();
          if (e.key === "Escape") setEditando(false);
        }}
      />
      <Button size="sm" onClick={handleGuardar} disabled={isPending}>
        {isPending ? "..." : "Guardar"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
    </span>
  );
}

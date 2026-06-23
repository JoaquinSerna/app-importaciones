"use client";

import { useState, useTransition } from "react";

import { actualizarTituloCarpeta } from "@/app/(app)/carpetas/[id]/actions";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export function TituloCarpetaEditor({ carpetaId, tituloActual }: { carpetaId: string; tituloActual: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(tituloActual ?? "");

  function guardar() {
    setEditando(false);
    if (valor.trim() === (tituloActual ?? "")) return;
    startTransition(async () => {
      const resultado = await actualizarTituloCarpeta(carpetaId, valor.trim());
      if (resultado.error) {
        toast({ title: "Error", description: resultado.error, variant: "destructive" });
      }
    });
  }

  if (!editando) {
    return (
      <p
        className="text-muted-foreground cursor-pointer underline decoration-dashed underline-offset-2 hover:text-foreground transition-colors"
        onClick={() => setEditando(true)}
        title="Clic para editar"
      >
        {tituloActual || <span className="italic">Sin título — clic para agregar</span>}
      </p>
    );
  }

  return (
    <Input
      autoFocus
      value={valor}
      disabled={isPending}
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") guardar();
        if (e.key === "Escape") { setValor(tituloActual ?? ""); setEditando(false); }
      }}
      placeholder="ej: Cascos de seguridad"
      className="h-7 max-w-xs text-sm"
    />
  );
}

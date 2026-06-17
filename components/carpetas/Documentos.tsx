"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";

import { subirYExtraerLiquidacion } from "@/app/(app)/carpetas/[id]/documentos/actions";
import { RevisionLiquidacion } from "@/components/carpetas/RevisionLiquidacion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import type { Costo, LiquidacionExtraida } from "@/lib/types";

interface DocumentosProps {
  carpetaId: string;
  costos: Costo[];
}

export function Documentos({ carpetaId, costos }: DocumentosProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [liquidacion, setLiquidacion] = useState<LiquidacionExtraida | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        const resultado = await subirYExtraerLiquidacion(carpetaId, formData);
        setLiquidacion(resultado.liquidacion);
        toast({
          title: "Liquidación procesada",
          description: `${resultado.liquidacion.conceptos.length} concepto(s) extraído(s).`,
        });
      } catch (err) {
        toast({
          title: "Error procesando el documento",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
          <Upload className="h-8 w-8" />
          <p>Subí el PDF de la liquidación del despachante de aduana para extraer sus datos.</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
            }}
          />
          <Button variant="outline" disabled={isPending} onClick={() => inputRef.current?.click()}>
            {isPending ? "Procesando..." : "Subir documento"}
          </Button>
        </CardContent>
      </Card>

      {liquidacion && (
        <RevisionLiquidacion
          carpetaId={carpetaId}
          costos={costos}
          liquidacion={liquidacion}
          onConfirmado={() => setLiquidacion(null)}
        />
      )}
    </div>
  );
}

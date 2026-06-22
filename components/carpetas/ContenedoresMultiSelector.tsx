"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { asignarContenedores } from "@/app/(app)/carpetas/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface ContenedorOpcion {
  id: string;
  numero_contenedor: string | null;
  tipo: string;
}

interface AsignacionActual {
  contenedorId: string;
  cbm: number;
}

interface Props {
  carpetaId: string;
  cbmTotalCarpeta: number;
  asignacionesActuales: AsignacionActual[];
  contenedores: ContenedorOpcion[];
}

export function ContenedoresMultiSelector({
  carpetaId,
  cbmTotalCarpeta,
  asignacionesActuales,
  contenedores,
}: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filas, setFilas] = useState<AsignacionActual[]>(
    asignacionesActuales.length > 0 ? asignacionesActuales : []
  );

  const sumaAsignada = filas.reduce((acc, f) => acc + f.cbm, 0);
  const restante = cbmTotalCarpeta - sumaAsignada;

  function agregarFila() {
    const yaUsados = new Set(filas.map((f) => f.contenedorId));
    const disponible = contenedores.find((c) => !yaUsados.has(c.id));
    if (!disponible) {
      toast({ title: "No hay más contenedores disponibles para agregar" });
      return;
    }
    setFilas([...filas, { contenedorId: disponible.id, cbm: Math.max(restante, 0) }]);
  }

  function quitarFila(idx: number) {
    setFilas(filas.filter((_, i) => i !== idx));
  }

  function actualizarFila(idx: number, cambios: Partial<AsignacionActual>) {
    setFilas(filas.map((f, i) => (i === idx ? { ...f, ...cambios } : f)));
  }

  function handleGuardar() {
    if (filas.some((f) => !f.contenedorId || f.cbm <= 0)) {
      toast({ title: "Revisá los datos", description: "Cada fila necesita un contenedor y un CBM mayor a 0.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const resultado = await asignarContenedores(
        carpetaId,
        filas.map((f) => ({ contenedorId: f.contenedorId, cbm: f.cbm }))
      );
      if (resultado.error) {
        toast({ title: "No se pudo asignar", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Contenedores actualizados" });
    });
  }

  return (
    <div className="space-y-3">
      {filas.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin contenedor asignado.</p>
      )}

      {filas.map((fila, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Select
            value={fila.contenedorId}
            onValueChange={(v) => actualizarFila(idx, { contenedorId: v })}
            disabled={isPending}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Contenedor" />
            </SelectTrigger>
            <SelectContent>
              {contenedores.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  #{c.numero_contenedor ?? "—"} · {c.tipo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={fila.cbm}
            onChange={(e) => actualizarFila(idx, { cbm: Number(e.target.value) || 0 })}
            disabled={isPending}
            className="w-28"
          />
          <span className="text-xs text-muted-foreground">m³</span>
          <Button size="sm" variant="ghost" onClick={() => quitarFila(idx)} disabled={isPending}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={agregarFila} disabled={isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Agregar contenedor
        </Button>
        {cbmTotalCarpeta > 0 && (
          <span className={`text-xs ${restante < -0.01 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            Repartido: {sumaAsignada.toFixed(1)} / {cbmTotalCarpeta.toFixed(1)} m³
            {restante > 0.01 ? ` (faltan ${restante.toFixed(1)} m³ por asignar)` : ""}
          </span>
        )}
      </div>

      <Button size="sm" onClick={handleGuardar} disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar asignación"}
      </Button>
    </div>
  );
}

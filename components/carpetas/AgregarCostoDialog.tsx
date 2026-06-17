"use client";

import { useState, useTransition } from "react";

import { agregarCostoManual } from "@/app/(app)/carpetas/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { CategoriaCosto } from "@/lib/types";

const CATEGORIAS: CategoriaCosto[] = [
  "impuesto",
  "flete",
  "seguro",
  "honorarios",
  "bancario",
  "imprevistos",
  "otro",
];

export function AgregarCostoDialog({ carpetaId }: { carpetaId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState<CategoriaCosto>("otro");
  const [montoEstimado, setMontoEstimado] = useState("");
  const [montoReal, setMontoReal] = useState("");
  const [notas, setNotas] = useState("");

  function handleSubmit() {
    const estimado = parseFloat(montoEstimado);
    if (!concepto || Number.isNaN(estimado)) {
      toast({ title: "Datos incompletos", description: "Completá concepto y monto estimado." });
      return;
    }

    startTransition(async () => {
      try {
        await agregarCostoManual({
          carpetaId,
          concepto,
          categoria,
          montoEstimadoUsd: estimado,
          montoRealUsd: montoReal ? parseFloat(montoReal) : undefined,
          notas: notas || undefined,
        });
        toast({ title: "Costo agregado" });
        setOpen(false);
        setConcepto("");
        setMontoEstimado("");
        setMontoReal("");
        setNotas("");
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Agregar costo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar costo manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="concepto">Concepto</Label>
            <Input id="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoria">Categoría</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaCosto)}>
              <SelectTrigger id="categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimado">Monto estimado (USD)</Label>
              <Input
                id="estimado"
                type="number"
                step="0.01"
                value={montoEstimado}
                onChange={(e) => setMontoEstimado(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="real">Monto real (USD, opcional)</Label>
              <Input
                id="real"
                type="number"
                step="0.01"
                value={montoReal}
                onChange={(e) => setMontoReal(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notas">Notas</Label>
            <Input id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

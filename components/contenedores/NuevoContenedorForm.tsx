"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { crearContenedor } from "@/app/(app)/contenedores/nuevo/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { TipoContenedor } from "@/lib/types";

const TIPOS: { value: TipoContenedor; label: string }[] = [
  { value: "40HQ", label: "40HQ" },
  { value: "20HQ", label: "20HQ" },
  { value: "AEREO", label: "Aéreo" },
];

export function NuevoContenedorForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [numeroContenedor, setNumeroContenedor] = useState("");
  const [tipo, setTipo] = useState<TipoContenedor>("40HQ");
  const [fechaZarpe, setFechaZarpe] = useState("");
  const [etaContenedor, setEtaContenedor] = useState("");
  const [observaciones, setObservaciones] = useState("");

  function handleSubmit() {
    if (!numeroContenedor.trim()) {
      toast({ title: "El número de contenedor es obligatorio" });
      return;
    }

    startTransition(async () => {
      try {
        const id = await crearContenedor({
          numeroContenedor: numeroContenedor.trim(),
          tipo,
          fechaZarpe: fechaZarpe || undefined,
          etaContenedor: etaContenedor || undefined,
          observaciones: observaciones || undefined,
        });
        router.push(`/contenedores/${id}`);
      } catch (err) {
        toast({
          title: "Error creando el contenedor",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del contenedor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="numero">Número de contenedor *</Label>
            <Input
              id="numero"
              type="number"
              min="1"
              step="1"
              placeholder="ej: 42"
              value={numeroContenedor}
              onChange={(e) => setNumeroContenedor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Debe ser mayor al último contenedor registrado.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContenedor)}>
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="zarpe">Fecha de zarpe</Label>
            <Input id="zarpe" type="date" value={fechaZarpe} onChange={(e) => setFechaZarpe(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eta">ETA</Label>
            <Input id="eta" type="date" value={etaContenedor} onChange={(e) => setEtaContenedor(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observaciones">Observaciones</Label>
          <Input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        <Button onClick={handleSubmit} disabled={isPending} className="w-full">
          {isPending ? "Creando..." : "Crear contenedor"}
        </Button>
      </CardContent>
    </Card>
  );
}

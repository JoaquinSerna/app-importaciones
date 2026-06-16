"use client";

import { useState, useTransition } from "react";

import { crearContenedor } from "@/app/contenedores/nuevo/actions";
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

const TIPOS: TipoContenedor[] = ["FCL_20", "FCL_40", "FCL_40HC", "LCL", "AEREO"];

export function NuevoContenedorForm() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [numeroContenedor, setNumeroContenedor] = useState("");
  const [tipo, setTipo] = useState<TipoContenedor>("FCL_40");
  const [naviera, setNaviera] = useState("");
  const [blNumber, setBlNumber] = useState("");
  const [fechaZarpe, setFechaZarpe] = useState("");
  const [etaContenedor, setEtaContenedor] = useState("");
  const [observaciones, setObservaciones] = useState("");

  function handleSubmit() {
    startTransition(async () => {
      try {
        await crearContenedor({
          numeroContenedor: numeroContenedor || undefined,
          tipo,
          naviera: naviera || undefined,
          blNumber: blNumber || undefined,
          fechaZarpe: fechaZarpe || undefined,
          etaContenedor: etaContenedor || undefined,
          observaciones: observaciones || undefined,
        });
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
            <Label htmlFor="numero">Número de contenedor</Label>
            <Input id="numero" value={numeroContenedor} onChange={(e) => setNumeroContenedor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContenedor)}>
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="naviera">Naviera</Label>
            <Input id="naviera" value={naviera} onChange={(e) => setNaviera(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bl">BL Number</Label>
            <Input id="bl" value={blNumber} onChange={(e) => setBlNumber(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="zarpe">Fecha de zarpe</Label>
            <Input id="zarpe" type="date" value={fechaZarpe} onChange={(e) => setFechaZarpe(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eta">ETA</Label>
            <Input
              id="eta"
              type="date"
              value={etaContenedor}
              onChange={(e) => setEtaContenedor(e.target.value)}
            />
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

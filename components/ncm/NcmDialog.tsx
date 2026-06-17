"use client";

import { useEffect, useState, useTransition } from "react";

import { actualizarNcm, crearNcm, type NcmArancelInput } from "@/app/(app)/ncm/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import type { NcmArancel } from "@/lib/types";

interface NcmDialogProps {
  /** Si se pasa, es modo edición. Si no, es modo creación. */
  ncm?: NcmArancel;
  trigger: React.ReactNode;
}

const DEFAULTS: NcmArancelInput = {
  codigo_ncm: "",
  descripcion: "",
  derecho_importacion_pct: 0,
  iva_pct: 21,
  aplica_iva_adicional: false,
  iva_adicional_pct: 0,
  aplica_anticipo_ganancias: false,
  anticipo_ganancias_pct: 0,
  aplica_iibb: false,
  iibb_pct: 0,
};

export function NcmDialog({ ncm, trigger }: NcmDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<NcmArancelInput>(DEFAULTS);

  useEffect(() => {
    if (open) {
      setForm(
        ncm
          ? {
              codigo_ncm: ncm.codigo_ncm,
              descripcion: ncm.descripcion ?? "",
              derecho_importacion_pct: ncm.derecho_importacion_pct,
              iva_pct: ncm.iva_pct,
              aplica_iva_adicional: ncm.aplica_iva_adicional,
              iva_adicional_pct: ncm.iva_adicional_pct,
              aplica_anticipo_ganancias: ncm.aplica_anticipo_ganancias,
              anticipo_ganancias_pct: ncm.anticipo_ganancias_pct,
              aplica_iibb: ncm.aplica_iibb,
              iibb_pct: ncm.iibb_pct,
            }
          : DEFAULTS
      );
    }
  }, [open, ncm]);

  function set<K extends keyof NcmArancelInput>(key: K, value: NcmArancelInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    if (!form.codigo_ncm.trim()) {
      toast({ title: "Código NCM requerido" });
      return;
    }

    startTransition(async () => {
      try {
        if (ncm) {
          await actualizarNcm(ncm.id, form);
          toast({ title: "NCM actualizado correctamente" });
        } else {
          await crearNcm(form);
          toast({ title: "NCM creado correctamente" });
        }
        setOpen(false);
      } catch (err) {
        toast({
          title: "Error guardando NCM",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ncm ? "Editar NCM" : "Nuevo NCM"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo_ncm">Código NCM *</Label>
              <Input
                id="codigo_ncm"
                value={form.codigo_ncm}
                onChange={(e) => set("codigo_ncm", e.target.value)}
                placeholder="9403.20.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="derecho_importacion_pct">Derecho de importación (%)</Label>
              <Input
                id="derecho_importacion_pct"
                type="number"
                min="0"
                step="0.01"
                value={form.derecho_importacion_pct}
                onChange={(e) => set("derecho_importacion_pct", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={form.descripcion ?? ""}
              onChange={(e) => set("descripcion", e.target.value)}
              placeholder="Muebles de madera para dormitorio..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="iva_pct">IVA (%)</Label>
            <Select
              value={String(form.iva_pct)}
              onValueChange={(v) => set("iva_pct", parseFloat(v))}
            >
              <SelectTrigger id="iva_pct">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="21">21%</SelectItem>
                <SelectItem value="10.5">10,5%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* IVA Adicional */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <input
                id="aplica_iva_adicional"
                type="checkbox"
                checked={form.aplica_iva_adicional}
                onChange={(e) => set("aplica_iva_adicional", e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="aplica_iva_adicional">Aplica IVA adicional</Label>
            </div>
            {form.aplica_iva_adicional && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="iva_adicional_pct">IVA adicional (%)</Label>
                <Input
                  id="iva_adicional_pct"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.iva_adicional_pct}
                  onChange={(e) => set("iva_adicional_pct", parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </div>

          {/* Anticipo Ganancias */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <input
                id="aplica_anticipo_ganancias"
                type="checkbox"
                checked={form.aplica_anticipo_ganancias}
                onChange={(e) => set("aplica_anticipo_ganancias", e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="aplica_anticipo_ganancias">Aplica anticipo ganancias</Label>
            </div>
            {form.aplica_anticipo_ganancias && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="anticipo_ganancias_pct">Anticipo ganancias (%)</Label>
                <Input
                  id="anticipo_ganancias_pct"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.anticipo_ganancias_pct}
                  onChange={(e) => set("anticipo_ganancias_pct", parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </div>

          {/* IIBB */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <input
                id="aplica_iibb"
                type="checkbox"
                checked={form.aplica_iibb}
                onChange={(e) => set("aplica_iibb", e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="aplica_iibb">Aplica IIBB</Label>
            </div>
            {form.aplica_iibb && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="iibb_pct">IIBB (%)</Label>
                <Input
                  id="iibb_pct"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.iibb_pct}
                  onChange={(e) => set("iibb_pct", parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Guardando..." : ncm ? "Guardar cambios" : "Crear NCM"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

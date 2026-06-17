"use client";

import { useState, useTransition } from "react";
import { crearProveedor, eliminarProveedor } from "@/app/(app)/proveedores/actions";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export function ProveedoresClient({ proveedores }: { proveedores: { id: string; nombre: string }[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [nombre, setNombre] = useState("");

  function handleCrear() {
    if (!nombre.trim()) return;
    startTransition(async () => {
      try {
        await crearProveedor(nombre);
        setNombre("");
      } catch (err) {
        toast({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Nombre del proveedor"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCrear()}
          className="max-w-sm"
        />
        <Button onClick={handleCrear} disabled={isPending || !nombre.trim()}>
          {isPending ? "Guardando..." : "Agregar"}
        </Button>
      </div>

      <div className="divide-y rounded-md border">
        {proveedores.length === 0 && (
          <p className="px-4 py-6 text-sm text-center text-muted-foreground">
            No hay proveedores registrados.
          </p>
        )}
        {proveedores.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">{p.nombre}</span>
            <DeleteButton
              label="Eliminar proveedor"
              description={`¿Eliminás a "${p.nombre}"? Las carpetas que lo referencian quedarán sin proveedor.`}
              onDelete={async () => { await eliminarProveedor(p.id); }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

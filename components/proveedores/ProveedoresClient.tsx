"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, UserCircle } from "lucide-react";

import { crearProveedor, eliminarProveedor, subirFotoProveedor } from "@/app/(app)/proveedores/actions";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface Proveedor {
  id: string;
  nombre: string;
  foto_url: string | null;
}

function FotoProveedor({ proveedor }: { proveedor: Proveedor }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(proveedor.foto_url);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      try {
        const url = await subirFotoProveedor(proveedor.id, formData);
        setPreviewUrl(url);
      } catch (err) {
        setPreviewUrl(proveedor.foto_url);
        toast({
          title: "Error al subir la foto",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="group relative h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center hover:opacity-90 transition-opacity"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        title="Subir foto de contacto"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={proveedor.nombre} className="h-full w-full object-cover" />
        ) : (
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="h-4 w-4 text-white" />
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

export function ProveedoresClient({ proveedores }: { proveedores: Proveedor[] }) {
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
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <FotoProveedor proveedor={p} />
            <span className="flex-1 text-sm font-medium">{p.nombre}</span>
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

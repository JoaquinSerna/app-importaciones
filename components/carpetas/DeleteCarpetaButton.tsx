"use client";

import { DeleteButton } from "@/components/ui/DeleteButton";
import { eliminarCarpeta } from "@/app/(app)/carpetas/actions";

export function DeleteCarpetaButton({ id, numero }: { id: string; numero: string }) {
  return (
    <DeleteButton
      label="Borrar"
      description={`Se eliminará la carpeta ${numero} junto con sus costos y SKUs. Esta acción no se puede deshacer.`}
      onDelete={() => eliminarCarpeta(id)}
    />
  );
}

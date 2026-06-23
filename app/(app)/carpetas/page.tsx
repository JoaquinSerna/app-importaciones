import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteCarpetaButton } from "@/components/carpetas/DeleteCarpetaButton";

const ESTADO_LABELS: Record<string, string> = {
  simulacion: "Simulación",
  pre_embarque: "Pre-embarque",
  en_transito: "En tránsito",
  en_aduana: "En aduana",
  finalizada: "Finalizada",
};

const ESTADO_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  simulacion: "secondary",
  pre_embarque: "outline",
  en_transito: "default",
  en_aduana: "destructive",
  finalizada: "secondary",
};

export default async function CarpetasPage() {
  const supabase = createClient();

  const { data: carpetas } = await supabase
    .from("carpetas")
    .select("id, numero_carpeta, titulo, estado, fob_total_usd, created_at, proveedores(nombre)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Carpetas</h1>
        <Button asChild>
          <Link href="/carpetas/nueva">+ Nueva carpeta</Link>
        </Button>
      </div>

      {!carpetas?.length ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No hay carpetas todavía.{" "}
          <Link href="/carpetas/nueva" className="underline">
            Creá la primera simulación
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">FOB (USD)</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {carpetas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">{c.numero_carpeta}</TableCell>
                  <TableCell className="text-muted-foreground">{c.titulo || "—"}</TableCell>
                  <TableCell>
                    {(c.proveedores as unknown as { nombre: string } | null)?.nombre ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.fob_total_usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_VARIANT[c.estado] ?? "secondary"}>
                      {ESTADO_LABELS[c.estado] ?? c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(c.created_at).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/carpetas/${c.id}`}>Ver</Link>
                    </Button>
                    <DeleteCarpetaButton id={c.id} numero={c.numero_carpeta} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

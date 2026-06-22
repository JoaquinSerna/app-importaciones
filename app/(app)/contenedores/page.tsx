import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteContenedorButton } from "@/components/contenedores/DeleteContenedorButton";
import { createClient } from "@/lib/supabase/server";
import type { Contenedor } from "@/lib/types";

function formatFecha(fecha: string | null) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-AR");
}

const CAPACIDAD_CBM: Record<string, number> = {
  "40HQ": 70,
  "20HQ": 28,
  "AEREO": 0,
};

export default async function ContenedoresPage() {
  const supabase = createClient();

  const [{ data: contenedores }, { data: asignaciones }] = await Promise.all([
    supabase.from("contenedores").select("*").order("created_at", { ascending: false }),
    supabase.from("carpeta_contenedores").select("contenedor_id, cbm_asignado"),
  ]);

  const lista = (contenedores ?? []) as Contenedor[];

  // CBM usado por contenedor
  const cbmUsado = new Map<string, number>();
  for (const a of asignaciones ?? []) {
    cbmUsado.set(a.contenedor_id, (cbmUsado.get(a.contenedor_id) ?? 0) + (a.cbm_asignado ?? 0));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contenedores</h1>
          <p className="text-muted-foreground">Gestión de contenedores y consolidación de carpetas.</p>
        </div>
        <Link href="/contenedores/nuevo">
          <Button>Nuevo contenedor</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Zarpe</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>CBM usado / cap.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => {
                const cap = CAPACIDAD_CBM[c.tipo] ?? 0;
                const usado = cbmUsado.get(c.id) ?? 0;
                const disponible = cap > 0 ? cap - usado : null;
                const pct = cap > 0 ? Math.min(100, (usado / cap) * 100) : 0;
                return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/contenedores/${c.id}`} className="font-medium hover:underline">
                      {c.numero_contenedor ?? "(sin número)"}
                    </Link>
                  </TableCell>
                  <TableCell>{c.tipo}</TableCell>
                  <TableCell>{formatFecha(c.fecha_zarpe)}</TableCell>
                  <TableCell>{formatFecha(c.eta_contenedor)}</TableCell>
                  <TableCell>
                    {cap > 0 ? (
                      <div className="space-y-1 min-w-[120px]">
                        <div className="text-xs">
                          {usado.toFixed(1)} / {cap} m³
                          <span className={`ml-2 font-medium ${(disponible ?? 0) < 5 ? "text-destructive" : "text-green-600"}`}>
                            ({disponible?.toFixed(1)} disp.)
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.estado_contenedor ? <Badge variant="secondary">{c.estado_contenedor}</Badge> : "-"}
                  </TableCell>
                  <TableCell className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/contenedores/${c.id}`}>Ver</Link>
                    </Button>
                    <DeleteContenedorButton id={c.id} numero={c.numero_contenedor} />
                  </TableCell>
                </TableRow>
                );
              })}
              {lista.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Sin contenedores registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

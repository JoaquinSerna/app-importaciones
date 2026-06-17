import { NcmDialog } from "@/components/ncm/NcmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { NcmArancel } from "@/lib/types";

export default async function NcmPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("ncm_aranceles")
    .select("*")
    .order("codigo_ncm", { ascending: true });

  const ncms = (data ?? []) as NcmArancel[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Posiciones arancelarias (NCM)</h1>
          <p className="text-muted-foreground">
            Administrá los aranceles por posición NCM. Estos datos se usan en el simulador de costos.
          </p>
        </div>
        <NcmDialog
          trigger={<Button>Nuevo NCM</Button>}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">NCMs registrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código NCM</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Derecho imp. %</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">IVA adic. %</TableHead>
                <TableHead className="text-right">Ganancias %</TableHead>
                <TableHead className="text-right">IIBB %</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ncms.map((ncm) => (
                <TableRow key={ncm.id}>
                  <TableCell className="font-mono font-medium">{ncm.codigo_ncm}</TableCell>
                  <TableCell className="text-muted-foreground">{ncm.descripcion ?? "—"}</TableCell>
                  <TableCell className="text-right">{ncm.derecho_importacion_pct}%</TableCell>
                  <TableCell className="text-right">{ncm.iva_pct}%</TableCell>
                  <TableCell className="text-right">
                    {ncm.aplica_iva_adicional ? `${ncm.iva_adicional_pct}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {ncm.aplica_anticipo_ganancias ? `${ncm.anticipo_ganancias_pct}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {ncm.aplica_iibb ? `${ncm.iibb_pct}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <NcmDialog
                      ncm={ncm}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
              {ncms.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No hay posiciones arancelarias registradas. Agregá la primera.
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

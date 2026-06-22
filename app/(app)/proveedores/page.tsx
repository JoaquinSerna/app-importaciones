import { obtenerUrlsFirmadas } from "@/app/actions/storage";
import { ProveedoresClient } from "@/components/proveedores/ProveedoresClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function ProveedoresPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("proveedores")
    .select("id, nombre, foto_url")
    .order("nombre", { ascending: true });

  const proveedoresList = data ?? [];
  const fotoUrls = proveedoresList.map((p) => p.foto_url).filter((u): u is string => !!u);
  const urlsFirmadas = fotoUrls.length > 0 ? await obtenerUrlsFirmadas(fotoUrls) : {};
  const proveedoresConFotoFirmada = proveedoresList.map((p) => ({
    ...p,
    foto_url: p.foto_url ? urlsFirmadas[p.foto_url] ?? p.foto_url : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <p className="text-muted-foreground">Administrá los proveedores disponibles para asignar a carpetas.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Proveedores registrados</CardTitle></CardHeader>
        <CardContent>
          <ProveedoresClient proveedores={proveedoresConFotoFirmada} />
        </CardContent>
      </Card>
    </div>
  );
}

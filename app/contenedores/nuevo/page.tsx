import { NuevoContenedorForm } from "@/components/contenedores/NuevoContenedorForm";

export default function NuevoContenedorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo contenedor</h1>
        <p className="text-muted-foreground">Registrá un contenedor para consolidar carpetas.</p>
      </div>
      <div className="max-w-xl">
        <NuevoContenedorForm />
      </div>
    </div>
  );
}

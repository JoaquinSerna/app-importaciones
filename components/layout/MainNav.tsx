"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/carpetas", label: "Carpetas" },
  { href: "/contenedores", label: "Contenedores" },
  { href: "/parametros", label: "Parámetros" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/ncm", label: "NCMs" },
  { href: "/reportes", label: "Reportes" },
  { href: "/manual", label: "Manual" },
];

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-cac-blue">
      <div className="container flex h-14 items-center gap-6">
        <Link href="/dashboard" className="font-semibold text-white">
          Importaciones
        </Link>
        <nav className="flex items-center gap-4 text-sm flex-1">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors text-white/70 hover:text-white",
                  active && "text-white font-medium underline underline-offset-8"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="border-white text-white hover:bg-white/10 hover:text-white bg-transparent"
        >
          Salir
        </Button>
      </div>
    </header>
  );
}

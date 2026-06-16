"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/carpetas", label: "Carpetas" },
  { href: "/contenedores", label: "Contenedores" },
  { href: "/parametros", label: "Parámetros" },
  { href: "/reportes", label: "Reportes" },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background">
      <div className="container flex h-14 items-center gap-6">
        <Link href="/dashboard" className="font-semibold">
          Importaciones
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors hover:text-foreground",
                  active ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

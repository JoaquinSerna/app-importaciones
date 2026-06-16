import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { MainNav } from "@/components/layout/MainNav";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Gestión de Importaciones",
  description: "App de gestión de costos de importación",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        <MainNav />
        <main className="container py-6">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}

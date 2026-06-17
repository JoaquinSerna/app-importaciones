import { MainNav } from "@/components/layout/MainNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MainNav />
      <main className="container py-6">{children}</main>
    </>
  );
}

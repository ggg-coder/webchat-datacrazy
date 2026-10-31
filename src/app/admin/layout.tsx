import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "./admin-shell";

export const metadata: Metadata = { title: "Painel · Webchat", robots: { index: false, follow: false } };

// The shell reads the current path (active menu item), which is request data: it streams inside Suspense.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Carregando…</div>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

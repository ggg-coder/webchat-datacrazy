"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Início" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/conexao", label: "Conexão DataCrazy" },
  { href: "/admin/aparencia", label: "Aparência" },
  { href: "/admin/formulario", label: "Formulário e horário" },
  { href: "/admin/instalacao", label: "Instalar no site" },
  { href: "/admin/testar", label: "Testar" },
  { href: "/admin/configuracoes", label: "Configurações" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname === "/admin/login") return <>{children}</>;

  async function logout() {
    await api("/api/admin/login", { method: "DELETE" });
    router.replace("/admin/login");
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-semibold">Webchat</span>
          <button type="button" className="text-sm md:hidden" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            Menu
          </button>
        </div>
        <nav className={`${menuOpen ? "block" : "hidden"} px-3 pb-4 md:block`}>
          {NAV.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={logout}
            className="mt-4 block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100"
          >
            Sair
          </button>
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
  );
}

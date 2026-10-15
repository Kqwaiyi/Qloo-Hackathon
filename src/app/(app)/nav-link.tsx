"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 font-medium ${active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
    >
      {children}
    </Link>
  );
}

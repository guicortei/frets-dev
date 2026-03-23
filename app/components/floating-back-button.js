"use client";

import Link from "next/link";
import { useAppLanguage } from "../i18n-provider";

export default function FloatingBackButton({
  href,
  className = "",
  label,
}) {
  const { tr } = useAppLanguage();
  const finalLabel = label || tr("< Back", "< Voltar");

  return (
    <Link
      href={href}
      className={`fixed left-4 top-4 z-40 inline-flex items-center gap-1 rounded-full border border-cyan-300/50 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-cyan-100 shadow-lg shadow-black/40 transition hover:bg-cyan-300/20 ${className}`}
    >
      {finalLabel}
    </Link>
  );
}

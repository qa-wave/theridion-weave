import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ScriptForm } from "@/app/scripts/script-form";

export default function NewScriptPage() {
  return (
    <>
      <Link href="/scripts" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={14} /> Skripty
      </Link>
      <PageHeader title="Nový skript" description="Vytvoř záznam automatizovaného testovacího skriptu." />
      <div className="max-w-2xl">
        <ScriptForm />
      </div>
    </>
  );
}

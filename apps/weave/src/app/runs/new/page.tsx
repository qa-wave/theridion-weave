import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listTestPlans } from "@/data/store";
import { Card, PageHeader } from "@/components/ui";
import { NewRunForm } from "./new-run-form";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const plans = await listTestPlans();

  return (
    <>
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft size={14} /> Běhy
      </Link>
      <PageHeader
        title="Nový manuální běh"
        description="Zvol test plán — Weave připraví scaffold se všemi jeho cases."
      />
      <Card>
        {plans.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-[var(--muted)]">
            <span>Zatím žádné test plány.</span>
            <Link href="/plans" className="text-[var(--accent)] hover:underline">
              Vytvořit test plán
            </Link>
          </div>
        ) : (
          <NewRunForm plans={plans} />
        )}
      </Card>
    </>
  );
}

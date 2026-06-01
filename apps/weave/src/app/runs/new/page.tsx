import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listTestPlans } from "@/data/store";
import { Card, PageHeader } from "@/components/ui";
import { NewRunForm } from "./new-run-form";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const t = await getServerT();
  const plans = await listTestPlans();

  return (
    <>
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft size={14} /> {t("newRun.backLink")}
      </Link>
      <PageHeader
        title={t("newRun.title")}
        description={t("newRun.description")}
      />
      <Card>
        {plans.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-[var(--muted)]">
            <span>{t("newRun.noPlans")}</span>
            <Link href="/plans" className="text-[var(--accent)] hover:underline">
              {t("newRun.noPlans.createPlan")}
            </Link>
          </div>
        ) : (
          <NewRunForm plans={plans} />
        )}
      </Card>
    </>
  );
}

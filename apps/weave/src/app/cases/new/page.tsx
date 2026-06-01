import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { CaseForm } from "../case-form";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const t = await getServerT();
  return (
    <>
      <Link href="/cases" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={14} /> {t("caseDetail.backLink")}
      </Link>
      <PageHeader title={t("newCase.title")} description={t("newCase.description")} />
      <Card>
        <CaseForm />
      </Card>
    </>
  );
}

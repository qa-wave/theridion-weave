import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ScriptForm } from "@/app/scripts/script-form";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewScriptPage() {
  const t = await getServerT();
  return (
    <>
      <Link href="/scripts" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={14} /> {t("scriptDetail.backLink")}
      </Link>
      <PageHeader title={t("newScript.title")} description={t("newScript.description")} />
      <div className="max-w-2xl">
        <ScriptForm />
      </div>
    </>
  );
}

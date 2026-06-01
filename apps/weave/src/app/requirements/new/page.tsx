import { listTestCases } from "@/data/store";
import { PageHeader } from "@/components/ui";
import { RequirementForm } from "@/components/requirement-form";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage() {
  const t = await getServerT();
  const allCases = await listTestCases({ status: "active" });
  return (
    <>
      <PageHeader title={t("newRequirement.title")} />
      <RequirementForm allCases={allCases} />
    </>
  );
}

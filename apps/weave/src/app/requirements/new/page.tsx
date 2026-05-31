import { listTestCases } from "@/data/store";
import { PageHeader } from "@/components/ui";
import { RequirementForm } from "@/components/requirement-form";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage() {
  const allCases = await listTestCases({ status: "active" });
  return (
    <>
      <PageHeader title="Nový požadavek" />
      <RequirementForm allCases={allCases} />
    </>
  );
}

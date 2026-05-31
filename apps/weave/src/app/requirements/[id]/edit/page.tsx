import { notFound } from "next/navigation";
import { getRequirement, listTestCases } from "@/data/store";
import { PageHeader } from "@/components/ui";
import { RequirementForm } from "@/components/requirement-form";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function EditRequirementPage({ params }: Props) {
  const { id } = await params;
  const [req, allCases] = await Promise.all([getRequirement(id), listTestCases()]);
  if (!req) notFound();

  return (
    <>
      <PageHeader title="Upravit požadavek" />
      <RequirementForm allCases={allCases} initial={req} />
    </>
  );
}

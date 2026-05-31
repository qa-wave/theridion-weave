import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { CaseForm } from "../case-form";

export default function NewCasePage() {
  return (
    <>
      <Link href="/cases" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={14} /> Test cases
      </Link>
      <PageHeader title="Nový test case" description="Vytvoř manuální testovací scénář." />
      <Card>
        <CaseForm />
      </Card>
    </>
  );
}

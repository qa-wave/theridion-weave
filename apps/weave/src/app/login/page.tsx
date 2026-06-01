import { Suspense } from "react";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-sm font-semibold">Theridion</div>
        <div className="text-xs text-[var(--accent)]">Weave</div>
      </div>
      <Card>
        <h1 className="mb-4 text-lg font-semibold">{t("login.title")}</h1>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  );
}

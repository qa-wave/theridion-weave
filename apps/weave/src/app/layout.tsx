import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Theridion Weave",
  description: "Test management nad manuálními testy a automatizovanými běhy z Theridion Eyes a Net.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 overflow-x-hidden px-8 py-8">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import type { Page } from "../../hooks/usePage";
import { SessionNavBar } from "../ui/sidebar";

export function DashboardLayout({
  children,
  page,
}: {
  children: ReactNode;
  page: Page;
}) {
  return (
    <div className="app-layout">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
          document.getElementById("main")?.scrollIntoView();
        }}
      >
        Ir para o conteúdo
      </a>
      <SessionNavBar page={page} />
      <main id="main" tabIndex={-1} className="main-content">
        {children}
      </main>
    </div>
  );
}

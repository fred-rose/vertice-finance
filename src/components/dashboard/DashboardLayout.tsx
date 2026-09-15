import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Layers,
  LayoutDashboard,
  ArrowLeftRight,
  ChartPie,
  Target,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { Page } from "../../hooks/usePage";
export function Sidebar({ page }: { page: Page }) {
  const links = [
    {
      icon: LayoutDashboard,
      label: "Visão Geral",
      page: "overview",
      href: "#/",
    },
    {
      icon: ArrowLeftRight,
      label: "Transações",
      page: "transactions",
      href: "#/transacoes",
    },
    { icon: ChartPie, label: "Orçamentos" },
    { icon: Target, label: "Metas" },
    { icon: Layers, label: "Patrimônio" },
    {
      icon: Settings2,
      label: "Configurações",
      page: "settings",
      href: "#/configuracoes",
    },
  ];
  return (
    <aside className="sidebar">
      <a className="brand" href="#/">
        <span className="brand-symbol">
          <ChartNoAxesCombined size={24} />
        </span>
        vértice<span className="brand-dot">.</span>
      </a>
      <div className="workspace">
        <span className="avatar">P</span>
        <div>
          Meu espaço pessoal<small>Finanças com perspectiva</small>
        </div>
      </div>
      <span className="nav-caption">PRINCIPAL</span>
      <nav aria-label="Navegação principal">
        {links.map(({ icon: Icon, label, href, page: target }) =>
          href ? (
            <a
              key={label}
              href={href}
              className={`nav-item enabled ${target === page ? "active" : ""}`}
              aria-current={target === page ? "page" : undefined}
              title={label}
            >
              <Icon size={19} />
              <span className="nav-label">{label}</span>
            </a>
          ) : (
            <button key={label} className="nav-item" disabled>
              <Icon size={19} />
              {label}
              <span className="soon">Em breve</span>
            </button>
          ),
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="perspective">
          <span className="tiny-label">UM PASSO DE CADA VEZ</span>
          <p>
            Clareza hoje.
            <br />
            Liberdade amanhã.
          </p>
          <ArrowUpRight size={20} />
        </div>
        <div className="local-note">
          <ShieldCheck size={15} />
          Seus dados ficam neste navegador
        </div>
      </div>
    </aside>
  );
}
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
      <Sidebar page={page} />
      <main id="main" tabIndex={-1} className="main-content">
        {children}
      </main>
    </div>
  );
}

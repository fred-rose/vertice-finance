import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, LayoutDashboard, Settings2 } from "lucide-react";
import type { Page } from "../../hooks/usePage";
import "./AppSidebar.css";

const links = [
  { page: "overview", href: "#/", label: "Visão Geral", icon: LayoutDashboard },
  {
    page: "transactions",
    href: "#/transacoes",
    label: "Transações",
    icon: ArrowLeftRight,
  },
  {
    page: "settings",
    href: "#/configuracoes",
    label: "Configurações",
    icon: Settings2,
  },
] as const;

export function AppSidebar({ page }: { page: Page }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const reduced = useReducedMotion();
  const expanded = hovered || focused || pinned;
  const transition = { duration: reduced ? 0 : 0.2, ease: "easeOut" as const };
  const labelMotion = {
    initial: false as const,
    animate: { opacity: expanded ? 1 : 0, x: expanded || reduced ? 0 : -5 },
    transition,
  };

  return (
    <motion.aside
      className="sidebar app-sidebar"
      aria-label="Barra lateral"
      data-expanded={expanded}
      initial={false}
      animate={{ width: expanded ? 240 : 52 }}
      transition={transition}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          setHovered(false);
          setPinned(false);
        }
      }}
      onFocusCapture={(event) =>
        setFocused(event.target.matches(":focus-visible"))
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="app-sidebar-brand">
        <button
          type="button"
          className="app-sidebar-toggle"
          aria-label={pinned ? "Recolher navegação" : "Expandir navegação"}
          aria-expanded={expanded}
          aria-controls="app-sidebar-navigation"
          onClick={() => setPinned((value) => !value)}
        >
          <span aria-hidden="true">V</span>
        </button>
        <motion.div
          className="app-sidebar-brand-copy"
          aria-hidden="true"
          {...labelMotion}
        >
          <strong>Vértice</strong>
          <small>Pessoal</small>
        </motion.div>
      </div>
      <nav id="app-sidebar-navigation" aria-label="Navegação principal">
        {links.map(({ page: target, href, label, icon: Icon }) => (
          <a
            key={target}
            href={href}
            className={`app-sidebar-link ${target === page ? "active" : ""} ${target === "settings" ? "app-sidebar-settings" : ""}`}
            aria-label={label}
            aria-current={target === page ? "page" : undefined}
            title={label}
          >
            <Icon size={19} aria-hidden="true" />
            <motion.span
              className="app-sidebar-label"
              aria-hidden="true"
              {...labelMotion}
            >
              {label}
            </motion.span>
          </a>
        ))}
      </nav>
    </motion.aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, LayoutDashboard, Settings2 } from "lucide-react";
import type { Page } from "../../hooks/usePage";
import "./AppSidebar.css";

// Reference: 15rem / 3.05rem at its 16px root. Vértice keeps its own 14px typography.
const widths = { open: 240, closed: 48.8 };

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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }
  useEffect(() => cancelClose, []);
  const reduced = useReducedMotion();
  const expanded = hovered || focused || pinned;
  const ease = [0.22, 1, 0.36, 1] as const;
  const transition = {
    type: "tween" as const,
    duration: reduced ? 0 : expanded ? 0.3 : 0.24,
    ease,
  };
  const labelMotion = (order = 0) => ({
    initial: false as const,
    animate: { opacity: expanded ? 1 : 0, x: expanded || reduced ? 0 : -4 },
    transition: {
      type: "tween" as const,
      duration: reduced ? 0 : 0.2,
      // Original 30ms stagger; 40ms entrance delay explicitly requested.
      delay: expanded && !reduced ? 0.04 + order * 0.03 : 0,
      ease,
    },
  });

  return (
    <motion.aside
      className="sidebar app-sidebar"
      aria-label="Barra lateral"
      data-expanded={expanded}
      initial={false}
      animate={{ width: expanded ? widths.open : widths.closed }}
      transition={transition}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          cancelClose();
          setHovered(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          cancelClose();
          closeTimer.current = setTimeout(
            () => {
              closeTimer.current = null;
              setHovered(false);
              setPinned(false);
            },
            reduced ? 0 : 100,
          );
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
          {...labelMotion()}
        >
          <strong>Vértice</strong>
          <small>Pessoal</small>
        </motion.div>
      </div>
      <nav id="app-sidebar-navigation" aria-label="Navegação principal">
        {links.map(({ page: target, href, label, icon: Icon }, index) => (
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
              {...labelMotion(index + 1)}
            >
              {label}
            </motion.span>
          </a>
        ))}
      </nav>
    </motion.aside>
  );
}

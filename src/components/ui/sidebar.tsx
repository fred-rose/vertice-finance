"use client";

// 21st.dev SessionNavBar supplied by the user. Vite/hash-route adaptation.
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowLeftRight,
  ChevronsUpDown,
  LayoutDashboard,
  Settings,
  UserCircle,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Page } from "@/hooks/usePage";
import "./sidebar.css";

const sidebarVariants = {
  // Original 15rem / 3.05rem measured against its 16px reference root.
  open: { width: "240px" },
  closed: { width: "48.8px" },
};

const contentVariants = {
  open: { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: { x: { stiffness: 1000, velocity: -100 } },
  },
  closed: {
    x: -20,
    opacity: 0,
    transition: { x: { stiffness: 100 } },
  },
};

const transitionProps = {
  type: "tween" as const,
  ease: "easeOut" as const,
  duration: 0.2,
  staggerChildren: 0.1,
};

const staggerVariants = {
  open: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

const links = [
  { page: "overview", href: "#/", label: "Visão Geral", icon: LayoutDashboard },
  {
    page: "transactions",
    href: "#/transacoes",
    label: "Transações",
    icon: ArrowLeftRight,
  },
] as const;

export function SessionNavBar({ page }: { page: Page }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pointerType = useRef("mouse");
  const reduced = useReducedMotion();
  const expanded = !isCollapsed || keyboardFocus || menuOpen;
  function closeAfterPointerNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (event.detail > 0 && pointerType.current !== "mouse") {
      setIsCollapsed(true);
      setKeyboardFocus(false);
    }
  }
  const labelVariants: Variants = reduced
    ? { open: { x: 0, opacity: 1 }, closed: { x: 0, opacity: 0 } }
    : variants;

  return (
    <motion.aside
      className={cn(
        "vertice-sidebar fixed left-0 z-40 h-full shrink-0 border-r",
      )}
      aria-label="Barra lateral"
      data-expanded={expanded}
      initial="closed"
      animate={expanded ? "open" : "closed"}
      variants={sidebarVariants}
      transition={reduced ? { duration: 0 } : transitionProps}
      onPointerDownCapture={(event) => {
        pointerType.current = event.pointerType;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setIsCollapsed(false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setIsCollapsed(true);
      }}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) setKeyboardFocus(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setKeyboardFocus(false);
      }}
    >
      <motion.div
        className="relative z-40 h-full shrink-0 flex-col bg-background text-muted-foreground transition-all"
        variants={contentVariants}
      >
        <motion.div
          variants={reduced ? undefined : staggerVariants}
          className="flex h-full flex-col"
        >
          <div className="flex min-h-0 grow flex-col items-center">
            <div className="flex h-[54px] w-full shrink-0 border-b p-2">
              <div className="mt-[1.5px] flex w-full">
                <DropdownMenu modal={false} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger className="w-full" asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex w-fit items-center gap-2 px-2"
                      aria-label="Menu do Vértice"
                    >
                      <Avatar className="size-4 rounded">
                        <AvatarFallback>V</AvatarFallback>
                      </Avatar>
                      <motion.span
                        variants={labelVariants}
                        className="flex w-fit items-center gap-2"
                      >
                        {expanded && (
                          <>
                            <span className="text-sm font-medium">Vértice</span>
                            <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />
                          </>
                        )}
                      </motion.span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="vertice-sidebar-menu"
                  >
                    <div className="px-2 py-1.5 text-sm font-medium">
                      Vértice · Pessoal
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      asChild
                      className="flex items-center gap-2"
                    >
                      <a
                        href="#/configuracoes"
                        onClick={closeAfterPointerNavigation}
                      >
                        <Settings className="h-4 w-4" /> Configurações
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <nav
              aria-label="Navegação principal"
              className="flex min-h-0 w-full grow flex-col"
            >
              <div className="flex min-h-0 grow flex-col gap-4">
                <ScrollArea className="h-16 grow p-2">
                  <div className={cn("flex w-full flex-col gap-1")}>
                    {links.map(({ page: target, href, label, icon: Icon }) => (
                      <a
                        key={target}
                        href={href}
                        onClick={closeAfterPointerNavigation}
                        aria-label={label}
                        title={label}
                        aria-current={page === target ? "page" : undefined}
                        className={cn(
                          "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-muted hover:text-primary",
                          page === target && "bg-muted text-blue-600",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <motion.span variants={labelVariants}>
                          {expanded && (
                            <span className="ml-2 whitespace-nowrap text-sm font-medium">
                              {label}
                            </span>
                          )}
                        </motion.span>
                      </a>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="flex flex-col p-2">
                <a
                  href="#/configuracoes"
                  onClick={closeAfterPointerNavigation}
                  aria-label="Configurações"
                  title="Configurações"
                  aria-current={page === "settings" ? "page" : undefined}
                  className={cn(
                    "mt-auto flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-muted hover:text-primary",
                    page === "settings" && "bg-muted text-blue-600",
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <motion.span variants={labelVariants}>
                    {expanded && (
                      <span className="ml-2 text-sm font-medium">
                        Configurações
                      </span>
                    )}
                  </motion.span>
                </a>
                <DropdownMenu modal={false} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger
                    className="w-full"
                    aria-label="Menu pessoal"
                  >
                    <span className="flex h-8 w-full flex-row items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-muted hover:text-primary">
                      <Avatar className="size-4">
                        <AvatarFallback>P</AvatarFallback>
                      </Avatar>
                      <motion.span
                        variants={labelVariants}
                        className="flex w-full items-center gap-2"
                      >
                        {expanded && (
                          <>
                            <span className="text-sm font-medium">Pessoal</span>
                            <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground/50" />
                          </>
                        )}
                      </motion.span>
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    sideOffset={5}
                    className="vertice-sidebar-menu"
                  >
                    <div className="flex flex-row items-center gap-2 p-2">
                      <Avatar className="size-6">
                        <AvatarFallback>P</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-medium">Pessoal</span>
                        <span className="text-xs text-muted-foreground">
                          Vértice
                        </span>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      asChild
                      className="flex items-center gap-2"
                    >
                      <a
                        href="#/configuracoes"
                        onClick={closeAfterPointerNavigation}
                      >
                        <UserCircle className="h-4 w-4" /> Configurações
                        pessoais
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>
          </div>
        </motion.div>
      </motion.div>
    </motion.aside>
  );
}

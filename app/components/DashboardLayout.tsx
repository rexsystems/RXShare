import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { getAvatarUrl } from "~/lib/utils-format";
import { cn } from "~/lib/utils";

const DEFAULT_LOGO = "https://cdn.694206767.xyz/rexsystems/logo-transparent.svg";

interface NavItem { label: string; path: string; group: "Library" | "Account" | "Admin"; adminOnly?: boolean }
const NAV: NavItem[] = [
  { label: "Files", path: "/dashboard", group: "Library" },
  { label: "Short links", path: "/dashboard/short-links", group: "Library" },
  { label: "Settings", path: "/dashboard/settings", group: "Account" },
  { label: "Admin", path: "/dashboard/admin", group: "Admin", adminOnly: true },
];

const getLogo = (s: any) => s?.logo_url?.trim() || DEFAULT_LOGO;
const isActive = (itemPath: string, currentPath: string) =>
  itemPath === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(itemPath);

interface ShellProps { children: ReactNode; user: any; systemSettings: any; isAdmin: boolean }

function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/auth/login");
  };
}

function Brand({ systemSettings }: { systemSettings: any }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 rounded-md text-base font-semibold text-foreground">
      <img src={getLogo(systemSettings)} alt="" width={28} height={28} className="size-7 object-contain" />
      <span className="truncate">{systemSettings?.site_name || "RXShare"}</span>
    </Link>
  );
}

function NavLinks({ admin, orientation, onNavigate }: { admin: boolean; orientation: "vertical" | "horizontal"; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const items = NAV.filter((i) => !i.adminOnly || admin);

  const link = (item: NavItem) => {
    const active = isActive(item.path, pathname);
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center rounded-md px-3 text-sm transition-colors lg:min-h-9",
          active ? "bg-white/10 font-medium text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
      >
        {item.label}
      </Link>
    );
  };

  if (orientation === "horizontal") {
    return <nav aria-label="Main" className="flex items-center gap-1">{items.map(link)}</nav>;
  }

  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 pb-1 text-xs text-muted-foreground">{g}</p>
          <div className="space-y-0.5">{items.filter((i) => i.group === g).map(link)}</div>
        </div>
      ))}
    </nav>
  );
}

function UserBlock({ user, compact }: { user: any; compact?: boolean }) {
  const signOut = useSignOut();
  return (
    <div className={cn("flex items-center gap-3", compact ? "" : "min-w-0")}>
      <img
        src={getAvatarUrl(user?.username || user?.email || "", 64, user?.avatar_url)}
        alt="" width={28} height={28} className="size-7 shrink-0 rounded-full object-cover"
      />
      {!compact && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{user?.username || "User"}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      )}
      <button
        type="button" onClick={signOut}
        className="min-h-11 shrink-0 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-9"
      >
        Sign out
      </button>
    </div>
  );
}

/** Phone and tablet bar: brand plus a menu button that discloses the same nav and account block. */
function MobileBar({ user, systemSettings, admin }: { user: any; systemSettings: any; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="border-b border-border lg:hidden">
      <div className="flex items-center justify-between px-5 py-2">
        <Brand systemSettings={systemSettings} />
        <button
          ref={buttonRef} type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}
          className="min-h-11 rounded-md border border-[var(--control-border)] px-4 text-sm font-medium"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="space-y-5 border-t border-border px-5 py-4">
          <NavLinks admin={admin} orientation="vertical" onNavigate={() => setOpen(false)} />
          <div className="border-t border-border pt-4"><UserBlock user={user} /></div>
        </div>
      )}
    </div>
  );
}

function SkipLink() {
  return (
    <a href="#main" className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
      Skip to content
    </a>
  );
}

/** Optional decorative pattern, chosen by the admin. Off by default. */
function Pattern({ systemSettings }: { systemSettings: any }) {
  const pat = systemSettings?.background_pattern || "none";
  if (pat === "none") return null;
  return <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 z-0 opacity-30", `bg-pattern-${pat}`)} />;
}

// ========== SIDEBAR ==========
export function SidebarLayout({ children, user, systemSettings, isAdmin: admin }: ShellProps) {
  return (
    <div className="relative min-h-screen bg-background text-foreground lg:flex">
      <SkipLink />
      <Pattern systemSettings={systemSettings} />
      <aside className="sticky top-0 z-10 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-border bg-background px-3 py-5 lg:flex">
        <div className="space-y-8 overflow-y-auto">
          <div className="px-3"><Brand systemSettings={systemSettings} /></div>
          <NavLinks admin={admin} orientation="vertical" />
        </div>
        <div className="border-t border-border px-3 pt-4"><UserBlock user={user} /></div>
      </aside>
      <div className="relative z-10 min-w-0 flex-1">
        <MobileBar user={user} systemSettings={systemSettings} admin={admin} />
        <main id="main" className="px-5 py-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

// ========== HEADER ==========
export function HeaderLayout({ children, user, systemSettings, isAdmin: admin }: ShellProps) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <SkipLink />
      <Pattern systemSettings={systemSettings} />
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background lg:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-8">
          <div className="flex items-center gap-8">
            <Brand systemSettings={systemSettings} />
            <NavLinks admin={admin} orientation="horizontal" />
          </div>
          <UserBlock user={user} compact />
        </div>
      </header>
      <div className="relative z-20"><MobileBar user={user} systemSettings={systemSettings} admin={admin} /></div>
      <main id="main" className="relative z-10 mx-auto max-w-6xl px-5 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

// ========== DOCK ==========
export function FloatingLayout({ children, user, systemSettings, isAdmin: admin }: ShellProps) {
  return (
    <div className="relative min-h-screen bg-background pb-24 text-foreground">
      <SkipLink />
      <Pattern systemSettings={systemSettings} />
      <main id="main" className="relative z-10 mx-auto max-w-6xl px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      <div className="fixed inset-x-0 bottom-3 z-30 flex justify-center px-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg">
          <Link to="/dashboard" aria-label="Home" className="flex min-h-11 items-center px-2">
            <img src={getLogo(systemSettings)} alt="" width={24} height={24} className="size-6 object-contain" />
          </Link>
          <NavLinks admin={admin} orientation="horizontal" />
          <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />
          <UserBlock user={user} compact />
        </div>
      </div>
    </div>
  );
}

// ========== MAIN EXPORT ==========
export function DashboardLayout({ children, user, systemSettings, isAdmin }: ShellProps) {
  const layout = systemSettings?.dashboard_layout || "sidebar";
  const props = { children, user, systemSettings, isAdmin };
  if (layout === "header") return <HeaderLayout {...props} />;
  if (layout === "floating") return <FloatingLayout {...props} />;
  return <SidebarLayout {...props} />;
}

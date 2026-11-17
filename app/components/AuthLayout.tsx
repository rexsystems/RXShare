import type { ReactNode } from "react";

const DEFAULT_LOGO = "https://cdn.694206767.xyz/rexsystems/logo-transparent.svg";

export function authLogo(settings: { logo_url?: string | null } | null | undefined) {
  return settings?.logo_url?.trim() || DEFAULT_LOGO;
}

interface AuthLayoutProps {
  siteName: string;
  logo: string;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** One narrow column on the page background. No card: the form is the page. */
export function AuthLayout({ siteName, logo, title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" width={28} height={28} className="size-7 object-contain" />
          <span className="text-base font-semibold">{siteName}</span>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          {children && <div className="mt-8">{children}</div>}
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

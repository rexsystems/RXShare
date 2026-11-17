import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, type LinksFunction, isRouteErrorResponse, useRouteError } from "react-router";
import { Toaster } from "~/components/ui/toaster";
import stylesheet from "~/app.css?url";
import { securityHeaders } from "~/.server/middleware";

export const middleware = [securityHeaders];

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "https://cdn.694206767.xyz/rexsystems/logo-transparent.svg" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" },
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: { request: Request }) {
  const { initDatabaseAsync, isFirstRun, queryOne } = await import("~/.server/db");
  const { generateCsrfToken, getCsrfFromCookie } = await import("~/.server/csrf");
  await import("~/.server/cleanup"); // Start cleanup jobs
  await initDatabaseAsync();
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith("/api/")) return null;
  try {
    if (path !== "/setup" && isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/setup" } });
    if (path === "/setup" && !isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/" } });
  } catch (e) { throw e; }

  let csrfCookieHeader: string | null = null;
  let csrfToken: string | null = null;

  // Generate CSRF token if not already set
  const existingToken = await getCsrfFromCookie(request);
  if (!existingToken) {
    const csrf = await generateCsrfToken();
    csrfCookieHeader = csrf.cookie;
    csrfToken = csrf.token;
  } else {
    csrfToken = existingToken;
  }

  // Load custom colors + background pattern for dynamic theming
  let themeData: { primaryColor: string | null; backgroundPattern: string } | null = null;
  try {
    if (!isFirstRun()) {
      const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
      if (sys) {
        themeData = {
          primaryColor: sys.primary_color || null,
          backgroundPattern: sys.background_pattern || "grid",
        };
      }
    }
  } catch {}

  const data = {
    ...(themeData || {}),
    csrfToken,
  };

  if (csrfCookieHeader) {
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": csrfCookieHeader,
      },
    });
  }

  return data;
}

export function Layout({ children }: { children: React.ReactNode }) {
  let colorStyle = "";
  let csrfToken = "";
  try {
    const data = useLoaderData<typeof loader>() as any;
    if (data?.csrfToken) csrfToken = data.csrfToken;
    if (data?.primaryColor) {
      const hex = String(data.primaryColor).replace(/[^#a-fA-F0-9]/g, "").slice(0, 7);
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const dr = Math.round(r * 0.85), dg = Math.round(g * 0.85), db = Math.round(b * 0.85);
        const hover = `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
        colorStyle = `:root { --primary: ${hex}; --primary-hover: ${hover}; --primary-r: ${r}; --primary-g: ${g}; --primary-b: ${b}; }`;
      }
    }
  } catch {}

  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {csrfToken && <meta name="csrf-token" content={csrfToken} />}
        <Meta />
        <Links />
        {colorStyle && <style dangerouslySetInnerHTML={{ __html: colorStyle }} />}
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isResponse = isRouteErrorResponse(error);

  let status = 500;
  let title = "Something went wrong";
  let message = "An unexpected error occurred. Please try again later.";

  if (isResponse) {
    status = error.status;
    switch (error.status) {
      case 404:
        title = "Page not found";
        message = "The page you're looking for doesn't exist or has been moved.";
        break;
      case 403:
        title = "Access denied";
        message = "You don't have permission to view this page.";
        break;
      case 401:
        title = "Unauthorized";
        message = "You need to sign in to access this page.";
        break;
      case 500:
        title = "Server error";
        message = "Something went wrong on our end. Please try again later.";
        break;
      default:
        title = `Error ${error.status}`;
        message = error.statusText || "An error occurred.";
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-5 pt-24 text-foreground sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="font-mono text-sm text-muted-foreground">{status}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex gap-3">
          <a href="/" className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-[var(--primary-hover)]">Go to start page</a>
          <button type="button" onClick={() => window.history.back()} className="inline-flex min-h-11 items-center rounded-md border border-[var(--control-border)] px-5 text-sm font-medium hover:bg-white/5">Go back</button>
        </div>
      </div>
    </main>
  );
}


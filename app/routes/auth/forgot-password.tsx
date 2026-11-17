import { useState, type FormEvent } from "react";
import { Link, useLoaderData } from "react-router";
import { getCsrfToken } from "~/lib/csrf";
import { AuthLayout, authLogo } from "~/components/AuthLayout";
import { btnPrimary, linkClass, Notice, TextField } from "~/components/form";

export async function loader({ request }: { request: Request }) {
  const { queryOne, isFirstRun } = await import("~/.server/db");
  const { getSession } = await import("~/.server/session");
  const session = await getSession(request);
  if (session) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  if (isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/setup" } });
  const { isEmailConfigured } = await import("~/.server/email");
  const settings = queryOne<any>("SELECT site_name, logo_url FROM system_settings LIMIT 1");
  return { settings, emailConfigured: isEmailConfigured() };
}

export const meta = ({ loaderData: data }: { loaderData?: { settings?: { site_name?: string | null } | null } }) => [
  { title: `Reset your password | ${data?.settings?.site_name || "RXShare"}` },
];

export default function ForgotPassword() {
  const { settings, emailConfigured } = useLoaderData<typeof loader>();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const siteName = settings?.site_name || "RXShare";
  const logo = authLogo(settings);
  const backToSignIn = <p><Link to="/auth/login" className={linkClass}>Back to sign in</Link></p>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      document.getElementById("f-email")?.focus();
      return;
    }
    setEmailError("");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The request failed. Try again in a moment.");
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  if (!emailConfigured) {
    return (
      <AuthLayout
        siteName={siteName} logo={logo} title="Password reset is unavailable"
        description="This instance has no email provider set up, so reset links cannot be sent. Ask the administrator to reset your password."
        footer={backToSignIn}
      />
    );
  }

  if (sent) {
    return (
      <AuthLayout
        siteName={siteName} logo={logo} title="Check your email"
        description={`If an account uses ${email.trim()}, a reset link is on its way. The link works for 1 hour.`}
        footer={
          <div className="space-y-1">
            <p><button type="button" className={`${linkClass} min-h-11`} onClick={() => setSent(false)}>Use a different email</button></p>
            {backToSignIn}
          </div>
        }
      />
    );
  }

  return (
    <AuthLayout
      siteName={siteName} logo={logo} title="Reset your password"
      description="Enter the email you signed up with and we will send a reset link."
      footer={backToSignIn}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <TextField
          fieldId="f-email" label="Email" type="email" value={email} onChange={setEmail} error={emailError}
          placeholder="you@example.com" autoComplete="email" autoFocus
        />
        {error && <Notice tone="error" title="Could not send the link">{error}</Notice>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={loading} aria-busy={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
}

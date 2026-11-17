import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLoaderData } from "react-router";
import { getCsrfToken } from "~/lib/csrf";
import { AuthLayout, authLogo } from "~/components/AuthLayout";
import { btnPrimary, linkClass, Notice, PasswordField } from "~/components/form";

export async function loader({ request }: { request: Request }) {
  const { queryOne, isFirstRun } = await import("~/.server/db");
  const { getSession } = await import("~/.server/session");
  const session = await getSession(request);
  if (session) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  if (isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/setup" } });

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });

  // Validate token exists and not expired
  const resetToken = queryOne<any>("SELECT id, expires_at FROM password_reset_tokens WHERE token = ? AND used = 0", [token]);
  const valid = resetToken && new Date(resetToken.expires_at) > new Date();

  const settings = queryOne<any>("SELECT site_name, logo_url FROM system_settings LIMIT 1");
  return { settings, token, valid: !!valid };
}

export const meta = ({ data }: { data?: { settings?: { site_name?: string | null } | null } }) => [
  { title: `Choose a new password | ${data?.settings?.site_name || "RXShare"}` },
];

export default function ResetPassword() {
  const { settings, token, valid } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const siteName = settings?.site_name || "RXShare";
  const logo = authLogo(settings);

  const errors: Record<string, string> = {};
  if (attempted) {
    if (password.length < 8) errors.password = "Use at least 8 characters.";
    else if (password.length > 128) errors.password = "Use 128 characters or fewer.";
    if (confirmPassword !== password) errors.confirmPassword = "The passwords do not match.";
  }

  if (!valid) {
    return (
      <AuthLayout
        siteName={siteName} logo={logo} title="This link no longer works"
        description="Reset links expire after 1 hour and can be used once."
        footer={<p><Link to="/auth/forgot-password" className={linkClass}>Request a new link</Link></p>}
      />
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (password.length < 8 || password.length > 128 || confirmPassword !== password) {
      requestAnimationFrame(() => document.getElementById(password.length < 8 || password.length > 128 ? "f-password" : "f-confirm")?.focus());
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The password could not be changed.");
      navigate("/auth/login?reset=1");
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout siteName={siteName} logo={logo} title="Choose a new password" description="Use at least 8 characters.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <PasswordField fieldId="f-password" label="New password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" autoFocus />
        <PasswordField fieldId="f-confirm" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} autoComplete="new-password" />
        {error && <Notice tone="error" title="Could not change the password">{error}</Notice>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={loading} aria-busy={loading}>
          {loading ? "Saving…" : "Change password"}
        </button>
      </form>
    </AuthLayout>
  );
}

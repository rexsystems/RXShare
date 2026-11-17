import { useState, type FormEvent } from "react";
import { useNavigate, Link, useLoaderData } from "react-router";
import { getCsrfToken } from "~/lib/csrf";
import { Captcha, useCaptcha } from "~/components/Captcha";
import { AuthLayout, authLogo } from "~/components/AuthLayout";
import { btnPrimary, linkClass, Notice, PasswordField, TextField } from "~/components/form";

export async function loader({ request }: { request: Request }) {
  const { queryOne, isFirstRun } = await import("~/.server/db");
  const { getSession } = await import("~/.server/session");
  
  // Redirect logged-in users to dashboard
  const session = await getSession(request);
  if (session) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  
  if (isFirstRun()) return { settings: null };
  try {
    const settings = queryOne<any>("SELECT site_name, site_description, allow_registration, allow_login, primary_color, accent_color, logo_url, background_pattern, captcha_provider, captcha_site_key, captcha_on_signup FROM system_settings LIMIT 1");
    return { settings: settings || null };
  } catch {
    return { settings: null };
  }
}

export const meta = ({ data }: { data?: { settings?: { site_name?: string | null } | null } }) => [
  { title: `Create account | ${data?.settings?.site_name || "RXShare"}` },
];

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const { settings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inviteCode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") || "" : "";

  const captchaEnabled = !!(settings?.captcha_provider && settings.captcha_provider !== "none" && settings.captcha_site_key && settings.captcha_on_signup);
  const { captchaToken, onVerify, onExpire } = useCaptcha();

  const siteName = settings?.site_name || "RXShare";
  const logo = authLogo(settings);

  const errors: Record<string, string> = {};
  if (attempted) {
    if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!USERNAME_RE.test(username)) errors.username = "3 to 30 characters: a-z, 0-9, dot, underscore or hyphen. No dot, underscore or hyphen at either end.";
    if (password.length < 8) errors.password = "Use at least 8 characters.";
    else if (password.length > 128) errors.password = "Use 128 characters or fewer.";
    if (confirmPassword !== password) errors.confirmPassword = "The passwords do not match.";
  }

  if (settings && !settings.allow_registration && !inviteCode) {
    return (
      <AuthLayout
        siteName={siteName} logo={logo} title="Registration is closed"
        description="New accounts are turned off on this instance. You need an invite link to join."
        footer={<p><Link to="/auth/login" className={linkClass}>Back to sign in</Link></p>}
      />
    );
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const bad =
      !EMAIL_RE.test(email.trim()) ? "f-email" :
      !USERNAME_RE.test(username) ? "f-username" :
      password.length < 8 || password.length > 128 ? "f-password" :
      confirmPassword !== password ? "f-confirm" : "";
    if (bad) { requestAnimationFrame(() => document.getElementById(bad)?.focus()); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email, password, username, captchaToken, ...(inviteCode ? { invite_code: inviteCode } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign-up failed.");
      navigate("/auth/login?registered=1");
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout
      siteName={siteName} logo={logo} title="Create an account"
      description={`Join ${siteName} to upload and share files.`}
      footer={<p>Already have an account? <Link to="/auth/login" className={linkClass}>Sign in</Link></p>}
    >
      <form onSubmit={handleSignUp} noValidate className="space-y-5">
        {inviteCode && <Notice tone="info">Invite link applied.</Notice>}
        <TextField fieldId="f-email" label="Email" type="email" value={email} onChange={setEmail} error={errors.email} placeholder="you@example.com" autoComplete="email" autoFocus />
        <TextField
          fieldId="f-username" label="Username" value={username} onChange={(v) => setUsername(v.toLowerCase())} error={errors.username}
          placeholder="Your username" autoComplete="username" autoCapitalize="none" spellCheck={false}
          hint="3 to 30 characters: a-z, 0-9, dot, underscore, hyphen."
        />
        <PasswordField fieldId="f-password" label="Password" value={password} onChange={setPassword} error={errors.password} hint="At least 8 characters." autoComplete="new-password" />
        <PasswordField fieldId="f-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} autoComplete="new-password" />
        {captchaEnabled && (
          <div>
            <Captcha provider={settings!.captcha_provider as any} siteKey={settings!.captcha_site_key!} onVerify={onVerify} onExpire={onExpire} />
            {!captchaToken && <p className="mt-1 text-center text-xs text-muted-foreground">Complete the check to create your account.</p>}
          </div>
        )}
        {error && <Notice tone="error" title="Could not create the account">{error}</Notice>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={loading || (captchaEnabled && !captchaToken)} aria-busy={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}

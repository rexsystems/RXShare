import { useState, type FormEvent } from "react";
import { useNavigate, Link, useLoaderData, useSearchParams } from "react-router";
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
    const settings = queryOne<any>("SELECT site_name, site_description, allow_registration, allow_login, primary_color, accent_color, logo_url, background_pattern, captcha_provider, captcha_site_key, captcha_on_login FROM system_settings LIMIT 1");
    return { settings: settings || null };
  } catch {
    return { settings: null };
  }
}

export const meta = ({ loaderData: data }: { loaderData?: { settings?: { site_name?: string | null } | null } }) => [
  { title: `Sign in | ${data?.settings?.site_name || "RXShare"}` },
];

export default function Login() {
  const { settings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const [requires2fa, setRequires2fa] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const captchaEnabled = !!(settings?.captcha_provider && settings.captcha_provider !== "none" && settings.captcha_site_key && settings.captcha_on_login);
  const { captchaToken, onVerify, onExpire } = useCaptcha();

  const siteName = settings?.site_name || "RXShare";
  const logo = authLogo(settings);
  const codeLength = useBackupCode ? 8 : 6;

  if (settings && !settings.allow_login) {
    return (
      <AuthLayout siteName={siteName} logo={logo} title="Sign-in is turned off" description="The administrator has disabled sign-in on this instance. Try again later or contact them." />
    );
  }

  const csrfHeaders = () => ({ "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) });

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!email.trim()) fe.email = "Enter your email address.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    if (fe.email || fe.password) {
      requestAnimationFrame(() => document.getElementById(fe.email ? "f-email" : "f-password")?.focus());
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: csrfHeaders(),
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign-in failed.");
      if (data.requires2fa) {
        setRequires2fa(true);
        setSessionId(data.sessionId);
        return;
      }
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleVerify2fa = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST", headers: csrfHeaders(),
        body: JSON.stringify({ sessionId, token: totpCode, useBackupCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That code was not accepted.");
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  if (requires2fa) {
    return (
      <AuthLayout
        siteName={siteName} logo={logo}
        title="Two-factor code"
        description={useBackupCode ? "Enter one of your 8-character backup codes." : "Enter the 6-digit code from your authenticator app."}
      >
        <form onSubmit={handleVerify2fa} noValidate className="space-y-5">
          <TextField
            fieldId="f-code" label={useBackupCode ? "Backup code" : "Authentication code"} value={totpCode}
            onChange={(v) => setTotpCode(useBackupCode ? v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : v.replace(/\D/g, "").slice(0, 6))}
            inputMode={useBackupCode ? "text" : "numeric"} autoComplete="one-time-code" autoFocus spellCheck={false}
            placeholder={useBackupCode ? "ABCD1234" : "123456"} className="font-mono text-lg tracking-widest"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={`${btnPrimary} w-full`} disabled={loading || totpCode.length !== codeLength} aria-busy={loading}>
            {loading ? "Verifying…" : "Verify"}
          </button>
          <div className="flex flex-col gap-1 text-sm">
            <button type="button" className={`${linkClass} min-h-11 text-left`} onClick={() => { setUseBackupCode(!useBackupCode); setTotpCode(""); setError(""); }}>
              {useBackupCode ? "Use the authenticator app instead" : "Use a backup code instead"}
            </button>
            <button
              type="button" className="min-h-11 text-left text-muted-foreground hover:text-foreground"
              onClick={() => { setRequires2fa(false); setSessionId(""); setTotpCode(""); setUseBackupCode(false); setError(""); }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      siteName={siteName} logo={logo}
      title="Sign in"
      description={`Use your ${siteName} account.`}
      footer={
        settings?.allow_registration === 1 ? (
          <p>No account yet? <Link to="/auth/sign-up" className={linkClass}>Create one</Link></p>
        ) : undefined
      }
    >
      <form onSubmit={handleLogin} noValidate className="space-y-5">
        {params.get("registered") && <Notice tone="info">Account created. Sign in to continue.</Notice>}
        {params.get("reset") && <Notice tone="info">Password changed. Sign in with the new one.</Notice>}
        <TextField
          fieldId="f-email" label="Email" type="email" value={email} onChange={setEmail} error={fieldErrors.email}
          placeholder="you@example.com" autoComplete="username" autoFocus
        />
        <div className="space-y-2">
          <PasswordField
            fieldId="f-password" label="Password" value={password} onChange={setPassword} error={fieldErrors.password}
            autoComplete="current-password"
          />
          <p className="text-sm"><Link to="/auth/forgot-password" className={linkClass}>Forgot your password?</Link></p>
        </div>
        {captchaEnabled && (
          <div>
            <Captcha provider={settings!.captcha_provider as any} siteKey={settings!.captcha_site_key!} onVerify={onVerify} onExpire={onExpire} />
            {!captchaToken && <p className="mt-1 text-center text-xs text-muted-foreground">Complete the check to sign in.</p>}
          </div>
        )}
        {error && <Notice tone="error" title="Could not sign in">{error}</Notice>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={loading || (captchaEnabled && !captchaToken)} aria-busy={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}

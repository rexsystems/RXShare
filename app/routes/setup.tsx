import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { getCsrfToken } from "~/lib/csrf";
import { cn } from "~/lib/utils";
import { btnPrimary, btnSecondary, CheckField, ChoiceGroup, linkClass, PasswordField, SelectField, TextField } from "~/components/form";

const LOGO = "https://cdn.694206767.xyz/rexsystems/logo-transparent.svg";

export const meta = () => [{ title: "Set up RXShare" }];

type DbType = "sqlite" | "mysql";
type StorageType = "local" | "s3";
type S3Provider = "aws" | "cloudflare" | "custom";
type Captcha = "none" | "recaptcha" | "turnstile" | "hcaptcha";

const STEPS = [
  { label: "Database", intro: "Where RXShare keeps users, file records and settings." },
  { label: "Storage", intro: "Where uploaded files are kept." },
  { label: "Site", intro: "How your instance names itself and builds share links." },
  { label: "Admin account", intro: "The first account. It gets full admin rights." },
  { label: "Bot protection", intro: "A CAPTCHA on login and sign-up. You can add one later in the admin panel.", optional: true },
  { label: "Email", intro: "Needed for password resets. Without it, resets are unavailable.", optional: true },
  { label: "Review", intro: "Confirming writes your .env file, creates the database and the admin account." },
] as const;

const LAST = STEPS.length;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CAPTCHA_LABEL: Record<Captcha, string> = {
  none: "Disabled",
  recaptcha: "Google reCAPTCHA v2",
  turnstile: "Cloudflare Turnstile",
  hcaptcha: "hCaptcha",
};

const CAPTCHA_LINK: Record<Exclude<Captcha, "none">, { href: string; label: string }> = {
  recaptcha: { href: "https://www.google.com/recaptcha/admin", label: "Google reCAPTCHA admin" },
  turnstile: { href: "https://dash.cloudflare.com/?to=/:account/turnstile", label: "the Cloudflare dashboard" },
  hcaptcha: { href: "https://dashboard.hcaptcha.com/signup", label: "the hCaptcha dashboard" },
};

const maskSecret = (s: string) => (s ? "••••" + s.slice(-4) : "Not set");

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [fromReview, setFromReview] = useState(false);
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [dbType, setDbType] = useState<DbType>("sqlite");
  const [dbHost, setDbHost] = useState("localhost");
  const [dbPort, setDbPort] = useState("3306");
  const [dbUser, setDbUser] = useState("root");
  const [dbPassword, setDbPassword] = useState("");
  const [dbName, setDbName] = useState("rxshare");

  const [storageType, setStorageType] = useState<StorageType>("local");
  const [s3Provider, setS3Provider] = useState<S3Provider>("aws");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");

  const [siteName, setSiteName] = useState("RXShare");
  const [baseUrl, setBaseUrl] = useState("");

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [captchaProvider, setCaptchaProvider] = useState<Captcha>("none");
  const [captchaSiteKey, setCaptchaSiteKey] = useState("");
  const [captchaSecretKey, setCaptchaSecretKey] = useState("");
  const [captchaOnLogin, setCaptchaOnLogin] = useState(true);
  const [captchaOnSignup, setCaptchaOnSignup] = useState(true);

  const [resendApiKey, setResendApiKey] = useState("");
  const [emailFrom, setEmailFrom] = useState("");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  const needsEndpoint = storageType === "s3" && s3Provider !== "aws";

  function validate(n: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (n === 1 && dbType === "mysql") {
      if (!dbHost.trim()) e.dbHost = "Enter the database host.";
      if (!/^\d{1,5}$/.test(dbPort.trim())) e.dbPort = "Enter a port number.";
      if (!dbUser.trim()) e.dbUser = "Enter the database user.";
      if (!dbName.trim()) e.dbName = "Enter the database name.";
    }
    if (n === 2 && storageType === "s3") {
      if (!s3Bucket.trim()) e.s3Bucket = "Enter the bucket name.";
      if (!s3AccessKey.trim()) e.s3AccessKey = "Enter the access key.";
      if (!s3SecretKey.trim()) e.s3SecretKey = "Enter the secret key.";
      if (needsEndpoint && !s3Endpoint.trim()) e.s3Endpoint = "This provider needs an endpoint URL.";
    }
    if (n === 3) {
      if (!siteName.trim()) e.siteName = "Enter a site name.";
      if (baseUrl.trim() && !/^https?:\/\/[^\s/]+/i.test(baseUrl.trim())) e.baseUrl = "Start with http:// or https://";
    }
    if (n === 4) {
      if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
      if (!USERNAME_RE.test(username)) e.username = "3 to 30 characters: a-z, 0-9, dot, underscore or hyphen. No hyphen, dot or underscore at either end.";
      if (password.length < 8) e.password = "Use at least 8 characters.";
      else if (password.length > 128) e.password = "Use 128 characters or fewer.";
      if (confirmPassword !== password) e.confirmPassword = "The passwords do not match.";
    }
    if (n === 5 && captchaProvider !== "none") {
      if (!captchaSiteKey.trim()) e.captchaSiteKey = "Enter the site key.";
      if (!captchaSecretKey.trim()) e.captchaSecretKey = "Enter the secret key.";
    }
    return e;
  }

  const errors = attempted[step] ? validate(step) : {};

  function focusFirst(e: Record<string, string>) {
    const first = Object.keys(e)[0];
    if (first) requestAnimationFrame(() => document.getElementById(`f-${first}`)?.focus());
  }

  function goTo(n: number) {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  }

  function next() {
    const e = validate(step);
    if (Object.keys(e).length) {
      setAttempted((a) => ({ ...a, [step]: true }));
      focusFirst(e);
      return;
    }
    if (fromReview) { setFromReview(false); goTo(LAST); return; }
    goTo(step + 1);
  }

  function editStep(n: number) {
    setFromReview(true);
    setStep(n);
  }

  async function submit() {
    setSubmitError("");
    for (let n = 1; n < LAST; n++) {
      const e = validate(n);
      if (Object.keys(e).length) {
        setAttempted((a) => ({ ...a, [n]: true }));
        setStep(n);
        focusFirst(e);
        return;
      }
    }
    setLoading(true);
    try {
      const csrf = getCsrfToken();
      const headers = { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) };

      const configRes = await fetch("/api/setup/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          dbType, dbHost, dbPort, dbUser, dbPassword, dbName,
          storageType, s3Bucket, s3Region, s3AccessKey, s3SecretKey,
          s3Endpoint: needsEndpoint ? s3Endpoint : undefined,
        }),
      });
      if (!configRes.ok) {
        const d = await configRes.json().catch(() => ({}));
        throw new Error(d.error || "Could not write the configuration file.");
      }

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email, password, username, isSetup: true, siteName, baseUrl: baseUrl || null,
          captchaProvider, captchaSiteKey: captchaSiteKey.trim() || null, captchaSecretKey: captchaSecretKey.trim() || null,
          captchaOnLogin, captchaOnSignup,
          resendApiKey: resendApiKey.trim() || null, emailFrom: emailFrom.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create the admin account.");

      navigate("/dashboard");
    } catch (err: any) {
      setSubmitError(err?.message || "Setup failed. Check the details and try again.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (loading) return;
    if (step === LAST) void submit();
    else next();
  }

  const current = STEPS[step - 1];

  const review = [
    {
      title: "Database", step: 1,
      rows: [
        ["Engine", dbType === "sqlite" ? "SQLite" : "MySQL / MariaDB"],
        ...(dbType === "mysql" ? [["Server", `${dbHost}:${dbPort}`], ["Database", dbName], ["User", dbUser]] : []),
      ],
    },
    {
      title: "Storage", step: 2,
      rows: [
        ["Type", storageType === "local" ? "Local disk" : s3Provider === "aws" ? "AWS S3" : s3Provider === "cloudflare" ? "Cloudflare R2" : "S3-compatible"],
        ...(storageType === "s3"
          ? [["Bucket", s3Bucket], ["Region", s3Region], ["Access key", maskSecret(s3AccessKey)], ...(needsEndpoint ? [["Endpoint", s3Endpoint]] : [])]
          : []),
      ],
    },
    { title: "Site", step: 3, rows: [["Name", siteName], ["Base URL", baseUrl || "Detected from the request"]] },
    { title: "Admin account", step: 4, rows: [["Email", email], ["Username", username], ["Password", "•".repeat(Math.min(password.length, 16))]] },
    {
      title: "Bot protection", step: 5,
      rows: [
        ["Provider", CAPTCHA_LABEL[captchaProvider]],
        ...(captchaProvider !== "none"
          ? [["Site key", maskSecret(captchaSiteKey)], ["On login", captchaOnLogin ? "Yes" : "No"], ["On sign-up", captchaOnSignup ? "Yes" : "No"]]
          : []),
      ],
    },
    {
      title: "Email", step: 6,
      rows: [
        ["Provider", resendApiKey ? "Resend" : "Not configured"],
        ...(resendApiKey ? [["API key", maskSecret(resendApiKey)]] : []),
        ...(emailFrom ? [["From", emailFrom]] : []),
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl lg:grid-cols-[280px_minmax(0,1fr)]">
        <header className="border-b border-border px-5 py-5 lg:border-b-0 lg:border-r lg:py-10 lg:pl-0 lg:pr-8">
          <div className="flex items-center gap-2.5">
            <img src={LOGO} alt="" width={28} height={28} className="size-7 object-contain" />
            <h1 className="text-base font-semibold">Set up RXShare</h1>
          </div>

          <p className="mt-3 hidden text-sm text-muted-foreground lg:block">Nothing is saved until you confirm on the last step.</p>

          <nav aria-label="Setup steps" className="mt-8 hidden lg:block">
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const n = i + 1;
                const done = n < step || (n <= maxStep && n !== step);
                const reachable = n <= maxStep && n !== step;
                const row = (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold",
                        n === step ? "bg-primary text-primary-foreground" : done ? "bg-white/10 text-foreground" : "border border-[var(--control-border)] text-muted-foreground"
                      )}
                    >
                      {done && n !== step ? "✓" : n}
                    </span>
                    <span className={cn("flex-1 text-left text-sm", n === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {s.label}
                      {done && n !== step && <span className="sr-only"> (completed)</span>}
                    </span>
                    {"optional" in s && s.optional && <span className="text-xs text-muted-foreground">Optional</span>}
                  </>
                );
                return (
                  <li key={s.label}>
                    {reachable ? (
                      <button type="button" onClick={() => { setFromReview(false); setStep(n); }} className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 hover:bg-white/5">
                        {row}
                      </button>
                    ) : (
                      <div aria-current={n === step ? "step" : undefined} className="flex min-h-11 w-full items-center gap-3 px-2">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="mt-4 lg:hidden">
            <p className="text-sm text-muted-foreground">Step {step} of {LAST}: {current.label}</p>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {STEPS.map((_, i) => <div key={i} className={cn("h-1 flex-1 rounded-sm", i < step ? "bg-primary" : "bg-white/15")} />)}
            </div>
          </div>
        </header>

        <main className="px-5 py-8 lg:px-12 lg:py-10">
          <form onSubmit={onSubmit} noValidate className="max-w-xl">
            <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold">{current.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{current.intro}</p>

            <div className="mt-6 space-y-5">
              {step === 1 && (
                <>
                  <ChoiceGroup<DbType>
                    legend="Database engine" name="db" value={dbType} onChange={setDbType}
                    options={[
                      { value: "sqlite", label: "SQLite", description: "One file in the data folder. Nothing else to run." },
                      { value: "mysql", label: "MySQL / MariaDB", description: "Use an existing server. You need its host and credentials." },
                    ]}
                  />
                  {dbType === "mysql" && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                        <TextField fieldId="f-dbHost" label="Host" value={dbHost} onChange={setDbHost} error={errors.dbHost} autoComplete="off" />
                        <TextField fieldId="f-dbPort" label="Port" value={dbPort} onChange={setDbPort} error={errors.dbPort} inputMode="numeric" />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField fieldId="f-dbUser" label="User" value={dbUser} onChange={setDbUser} error={errors.dbUser} autoComplete="off" />
                        <PasswordField fieldId="f-dbPassword" label="Password" value={dbPassword} onChange={setDbPassword} />
                      </div>
                      <TextField fieldId="f-dbName" label="Database name" value={dbName} onChange={setDbName} error={errors.dbName} autoComplete="off" />
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <ChoiceGroup<StorageType>
                    legend="File storage" name="storage" value={storageType} onChange={setStorageType}
                    options={[
                      { value: "local", label: "Local disk", description: "Files live in the data folder, next to the database." },
                      { value: "s3", label: "S3-compatible", description: "AWS S3, Cloudflare R2, MinIO or any service with an S3 API." },
                    ]}
                  />
                  {storageType === "s3" && (
                    <div className="space-y-4">
                      <SelectField
                        fieldId="f-s3Provider" label="Provider" value={s3Provider}
                        onChange={(v) => { setS3Provider(v as S3Provider); if (v === "cloudflare") setS3Region("auto"); }}
                        options={[{ value: "aws", label: "AWS S3" }, { value: "cloudflare", label: "Cloudflare R2" }, { value: "custom", label: "Other S3-compatible" }]}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField fieldId="f-s3Bucket" label="Bucket" value={s3Bucket} onChange={setS3Bucket} error={errors.s3Bucket} autoComplete="off" />
                        <TextField fieldId="f-s3Region" label="Region" value={s3Region} onChange={setS3Region} placeholder={s3Provider === "cloudflare" ? "auto" : "us-east-1"} autoComplete="off" />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField fieldId="f-s3AccessKey" label="Access key" value={s3AccessKey} onChange={setS3AccessKey} error={errors.s3AccessKey} autoComplete="off" />
                        <PasswordField fieldId="f-s3SecretKey" label="Secret key" value={s3SecretKey} onChange={setS3SecretKey} error={errors.s3SecretKey} />
                      </div>
                      {needsEndpoint && (
                        <TextField
                          fieldId="f-s3Endpoint" label="Endpoint URL" value={s3Endpoint} onChange={setS3Endpoint} error={errors.s3Endpoint}
                          placeholder={s3Provider === "cloudflare" ? "https://<account-id>.r2.cloudflarestorage.com" : "https://s3.example.com"}
                          hint={s3Provider === "cloudflare" ? "In the Cloudflare dashboard: R2, then Overview." : undefined}
                          autoComplete="off"
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <TextField fieldId="f-siteName" label="Site name" value={siteName} onChange={setSiteName} error={errors.siteName} />
                  <TextField
                    fieldId="f-baseUrl" label="Base URL" optional value={baseUrl} onChange={setBaseUrl} error={errors.baseUrl}
                    placeholder="https://share.example.com" inputMode="url" autoComplete="off"
                    hint="Used in share links. Leave it empty to detect it from the request."
                  />
                </>
              )}

              {step === 4 && (
                <>
                  <TextField fieldId="f-email" label="Email" type="email" value={email} onChange={setEmail} error={errors.email} placeholder="admin@example.com" autoComplete="email" />
                  <TextField
                    fieldId="f-username" label="Username" value={username} onChange={(v) => setUsername(v.toLowerCase())} error={errors.username}
                    placeholder="Your username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                    hint="3 to 30 characters: a-z, 0-9, dot, underscore, hyphen."
                  />
                  <PasswordField fieldId="f-password" label="Password" value={password} onChange={setPassword} error={errors.password} hint="At least 8 characters." autoComplete="new-password" />
                  <PasswordField fieldId="f-confirmPassword" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} autoComplete="new-password" />
                </>
              )}

              {step === 5 && (
                <>
                  <ChoiceGroup<Captcha>
                    legend="CAPTCHA provider" name="captcha" value={captchaProvider} onChange={setCaptchaProvider}
                    options={[
                      { value: "none", label: "None", description: "No CAPTCHA. Rate limiting still applies." },
                      { value: "turnstile", label: "Cloudflare Turnstile" },
                      { value: "recaptcha", label: "Google reCAPTCHA v2" },
                      { value: "hcaptcha", label: "hCaptcha" },
                    ]}
                  />
                  {captchaProvider !== "none" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Get your keys from{" "}
                        <a href={CAPTCHA_LINK[captchaProvider].href} target="_blank" rel="noopener noreferrer" className={linkClass}>{CAPTCHA_LINK[captchaProvider].label}</a>.
                      </p>
                      <TextField fieldId="f-captchaSiteKey" label="Site key" value={captchaSiteKey} onChange={setCaptchaSiteKey} error={errors.captchaSiteKey} autoComplete="off" />
                      <PasswordField fieldId="f-captchaSecretKey" label="Secret key" value={captchaSecretKey} onChange={setCaptchaSecretKey} error={errors.captchaSecretKey} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <CheckField label="Require on login" checked={captchaOnLogin} onChange={setCaptchaOnLogin} />
                        <CheckField label="Require on sign-up" checked={captchaOnSignup} onChange={setCaptchaOnSignup} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 6 && (
                <>
                  <PasswordField
                    fieldId="f-resendApiKey" label="Resend API key" optional value={resendApiKey} onChange={setResendApiKey} placeholder="re_..."
                    hint={<>Create one at <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className={linkClass}>resend.com/api-keys</a>.</>}
                  />
                  <TextField
                    fieldId="f-emailFrom" label="From address" optional value={emailFrom} onChange={setEmailFrom}
                    placeholder="RXShare <noreply@yourdomain.com>" autoComplete="off"
                    hint="The domain must be verified in Resend. For a test, use noreply@resend.dev."
                  />
                </>
              )}

              {step === LAST && (
                <div className="space-y-6">
                  {review.map((g) => (
                    <section key={g.title} aria-labelledby={`r-${g.step}`}>
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <h3 id={`r-${g.step}`} className="text-sm font-semibold">{g.title}</h3>
                        <button type="button" onClick={() => editStep(g.step)} aria-label={`Edit ${g.title}`} className={cn(linkClass, "min-h-11 px-1 text-sm")}>Edit</button>
                      </div>
                      <dl className="divide-y divide-border text-sm">
                        {g.rows.map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-6 py-2">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="min-w-0 break-words text-right text-foreground">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {submitError && (
              <div role="alert" className="mt-6 rounded-md border border-red-400/60 p-3 text-sm text-red-300">
                <p className="font-medium">Setup did not finish.</p>
                <p className="mt-0.5">{submitError}</p>
              </div>
            )}

            <div className="mt-8 flex gap-3 border-t border-border pt-6">
              {step > 1 && (
                <button type="button" className={btnSecondary} onClick={() => { setFromReview(false); setStep(step - 1); }} disabled={loading}>
                  Back
                </button>
              )}
              <button type="submit" className={cn(btnPrimary, "flex-1 sm:flex-none")} disabled={loading} aria-busy={loading}>
                {step === LAST ? (loading ? "Setting up…" : "Create admin and finish") : fromReview ? "Back to review" : "Continue"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

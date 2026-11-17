import { useState, useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { queryOne, execute } from "~/.server/db";
import { getSession } from "~/.server/session";
import { getBaseUrl } from "~/.server/base-url";
import { getMimeCategory, formatFileSize } from "~/lib/utils-format";
import { btnPrimary, btnSecondary, linkClass, PasswordField } from "~/components/form";
import { codeToHtml } from "shiki";
import QRCode from "qrcode";

export async function loader({ params, request }: { params: { fileName: string }; request: Request }) {
  const upload = queryOne<any>("SELECT u.*, us.embed_title, us.embed_description, us.embed_color, us.embed_author, us.embed_site_name, us.embed_logo_url, us.custom_path, usr.username FROM uploads u LEFT JOIN user_settings us ON u.user_id = us.user_id LEFT JOIN users usr ON u.user_id = usr.id WHERE u.file_name = ?", [params.fileName]);
  if (!upload) throw new Response("Not Found", { status: 404 });

  const session = await getSession(request);
  const isOwner = session && session.user.id === upload.user_id;

  // Check expiration (owner can still access)
  if (upload.expires_at && !isOwner) {
    if (new Date(upload.expires_at) < new Date()) {
      throw new Response("This link has expired", { status: 410 });
    }
  }

  if (!upload.is_public && !isOwner) {
    throw new Response("Not Found", { status: 404 });
  }

  // Check password protection (owner bypasses)
  const needsPassword = !!upload.password_hash && !isOwner;
  if (needsPassword) {
    const { verifyCookieSignature } = await import("~/.server/file-password");
    const cookieHeader = request.headers.get("Cookie") || "";
    const pwCookieName = `pw_${upload.id}`;
    const pwMatch = cookieHeader.match(new RegExp(`${pwCookieName}=([^;]+)`));
    const pwCookieValid = pwMatch ? verifyCookieSignature(pwMatch[1], upload.id) : false;
    if (!pwCookieValid) {
      // Return minimal data for password gate
      const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
      return { passwordRequired: true, fileName: params.fileName, originalName: upload.original_name, backgroundPattern: sys?.background_pattern || "none" };
    }
  }

  // Deduplicate view counts: only increment once per upload per visitor per hour
  const cookieHeader = request.headers.get("Cookie") || "";
  const viewedKey = `viewed_${upload.id}`;
  const alreadyViewed = cookieHeader.includes(viewedKey);
  let setCookieHeader: string | null = null;

  if (!alreadyViewed) {
    execute("UPDATE uploads SET views = views + 1 WHERE id = ?", [upload.id]);
    upload.views = (upload.views || 0) + 1;
    // Set a cookie that expires in 1 hour to prevent re-counting
    setCookieHeader = `${viewedKey}=1; Path=/v/${params.fileName}; Max-Age=3600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  }

  const baseUrl = getBaseUrl(request);
  const sys = queryOne<any>("SELECT primary_color, background_pattern, show_powered_by FROM system_settings LIMIT 1");
  const data = { upload, baseUrl, primaryColor: sys?.primary_color || null, backgroundPattern: sys?.background_pattern || "none", showPoweredBy: sys?.show_powered_by !== 0 };

  if (setCookieHeader) {
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setCookieHeader,
      },
    });
  }

  return data;
}

export function meta({ loaderData: data }: { loaderData: any }) {
  if (!data?.upload) return [{ title: "Not Found" }];
  const { upload, baseUrl, primaryColor } = data;
  const isImage = upload.mime_type?.startsWith("image/");
  const isVideo = upload.mime_type?.startsWith("video/");
  const isGif = upload.mime_type === "image/gif";
  const fileUrl = `${baseUrl}/api/files/${upload.file_path}`;
  const ogImage = isImage ? fileUrl : upload.preview_path ? `${baseUrl}/api/files/${upload.preview_path}` : null;
  const safeColor = (c: string) => /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#f97316";
  const siteName = upload.embed_site_name || "RXShare";
  const author = upload.embed_author || upload.username || null;
  return [
    { title: upload.embed_title || upload.original_name },
    { name: "description", content: upload.embed_description || `${upload.original_name} - ${formatFileSize(upload.file_size)}` },
    { property: "og:title", content: upload.embed_title || upload.original_name },
    { property: "og:description", content: upload.embed_description || formatFileSize(upload.file_size) },
    { property: "og:site_name", content: siteName },
    ...(author ? [{ property: "article:author", content: author }] : []),
    ...(ogImage ? [
      { property: "og:image", content: ogImage },
    ] : []),
    ...(upload.embed_logo_url ? [{ property: "og:image:alt", content: siteName }] : []),
    { property: "og:type", content: isImage ? "image" : "website" },
    { name: "twitter:card", content: isImage || isVideo ? "summary_large_image" : "summary" },
    ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : []),
    { name: "theme-color", content: safeColor(upload.embed_color || primaryColor || "#f97316") },
    ...(isVideo ? [
      { property: "og:video", content: fileUrl },
      { property: "og:video:type", content: upload.mime_type },
    ] : []),
  ];
}

export default function Viewer() {
  const data = useLoaderData<typeof loader>() as any;

  if (data.passwordRequired) {
    return <PasswordGate fileName={data.fileName} originalName={data.originalName} />;
  }

  const { upload, showPoweredBy } = data;
  const category = getMimeCategory(upload.mime_type);
  const fileUrl = `/api/files/${upload.file_path}`;

  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shareUrl = `${data.baseUrl}/v/${upload.file_name}`;
    QRCode.toDataURL(shareUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" } }).then(setQrDataUrl).catch(() => {});
  }, [data.baseUrl, upload.file_name]);

  useEffect(() => {
    if (!showQr) return;
    const onDown = (e: MouseEvent) => { if (qrRef.current && !qrRef.current.contains(e.target as Node)) setShowQr(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowQr(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showQr]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{upload.original_name}</h1>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(upload.file_size)} · {upload.views} views · {upload.downloads || 0} downloads
            </p>
            {upload.description && <p className="mt-1 text-sm">{upload.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary}>Raw file</a>
            <div className="relative" ref={qrRef}>
              <button type="button" className={btnSecondary} aria-expanded={showQr} aria-controls="qr-panel" onClick={() => setShowQr((v) => !v)}>QR code</button>
              {showQr && qrDataUrl && (
                <div id="qr-panel" className="absolute right-0 top-full z-30 mt-2 rounded-lg border border-border bg-card p-3 shadow-lg">
                  <img src={qrDataUrl} alt={`QR code for ${data.baseUrl}/v/${upload.file_name}`} width={200} height={200} className="size-[200px] max-w-none rounded" />
                </div>
              )}
            </div>
            <a href={fileUrl} download={upload.original_name} className={btnPrimary}>Download</a>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-6 sm:px-8">
        <div className="w-full max-w-7xl overflow-hidden rounded-lg border border-border bg-card">
          {category === "image" && <img src={fileUrl} alt={upload.original_name} className="mx-auto h-auto max-h-[calc(100vh-10rem)] w-auto max-w-full object-contain" />}
          {category === "video" && <video src={fileUrl} controls autoPlay className="mx-auto max-h-[calc(100vh-10rem)] w-full" />}
          {category === "audio" && <div className="p-8"><audio src={fileUrl} controls className="w-full" /></div>}
          {category === "pdf" && <iframe src={fileUrl} title={upload.original_name} className="h-[calc(100vh-10rem)] w-full" />}
          {(category === "text" || category === "code") && <TextViewer url={fileUrl} fileName={upload.original_name} />}
          {category === "other" && (
            <div className="px-6 py-16 text-center">
              <p className="font-medium">No preview for this file type</p>
              <p className="mt-1 text-sm text-muted-foreground">Download it to open it on your device.</p>
              <a href={fileUrl} download={upload.original_name} className={`${btnPrimary} mt-5`}>Download</a>
            </div>
          )}
        </div>
      </main>

      {showPoweredBy && (
        <footer className="px-5 py-4 text-center text-xs text-muted-foreground">
          Shared with <a href="https://github.com/rexsystems/RXShare" target="_blank" rel="noopener noreferrer" className={linkClass}>RXShare</a>
        </footer>
      )}
    </div>
  );
}

function TextViewer({ url, fileName }: { url: string; fileName: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error("bad status"); return r.text(); })
      .then((t) => { if (!cancelled) setContent(t.slice(0, 50000)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!content) return;
    let cancelled = false;
    const ext = fileName.split(".").pop()?.toLowerCase() || "text";
    const langMap: Record<string, string> = {
      js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx",
      py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
      c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
      php: "php", sh: "bash", bash: "bash", zsh: "bash",
      json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
      xml: "xml", html: "html", css: "css", scss: "scss",
      sql: "sql", md: "markdown", kt: "kotlin", swift: "swift",
      lua: "lua", r: "r", pl: "perl", ex: "elixir", zig: "zig",
      dockerfile: "dockerfile", makefile: "makefile",
    };
    codeToHtml(content, { lang: langMap[ext] || ext, theme: "tokyo-night" })
      .then((html) => { if (!cancelled) setHighlightedHtml(html); })
      .catch(() => { /* fall back to the plain text below */ });
    return () => { cancelled = true; };
  }, [content, fileName]);

  // Shiki returns trusted, escaped markup; write it through a ref so React does not reconcile it.
  useEffect(() => {
    if (codeRef.current && highlightedHtml) codeRef.current.innerHTML = highlightedHtml;
  }, [highlightedHtml]);

  if (failed) return <p role="alert" className="px-6 py-14 text-center text-sm text-red-300">This file could not be loaded.</p>;

  return (
    <div ref={codeRef} tabIndex={0} role="region" aria-label={`Contents of ${fileName}`} className="max-h-[calc(100vh-10rem)] overflow-auto p-4 text-sm [&_code]:!font-mono [&_pre]:!bg-transparent">
      {!highlightedHtml && <pre className="whitespace-pre-wrap font-mono">{content ?? "Loading…"}</pre>}
    </div>
  );
}

function PasswordGate({ fileName, originalName }: { fileName: string; originalName: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Enter the password."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(res.status === 429 ? "Too many attempts. Wait a few minutes and try again." : d.error || "That password is not right.");
        return;
      }
      window.location.reload();
    } catch { setError("Could not check the password. Try again."); }
    finally { setLoading(false); }
  };

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-5 pt-24 text-foreground sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">This file is protected</h1>
        <p className="mt-1.5 truncate text-sm text-muted-foreground">{originalName}</p>
        <form onSubmit={submit} noValidate className="mt-8 space-y-5">
          <PasswordField fieldId="f-password" label="Password" value={password} onChange={setPassword} error={error} autoFocus autoComplete="off" />
          <button type="submit" disabled={loading} aria-busy={loading} className={`${btnPrimary} w-full`}>{loading ? "Checking…" : "Unlock file"}</button>
        </form>
      </div>
    </main>
  );
}

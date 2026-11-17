import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { Icon } from "~/components/Icon";
import { useToast } from "~/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { getCsrfToken } from "~/lib/csrf";
import { formatRelativeDate } from "~/lib/utils-format";
import { getSession } from "~/.server/session";
import { query } from "~/.server/db";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });
  const links = query<any>(
    `SELECT sl.*, u.original_name, u.file_name 
     FROM short_links sl 
     LEFT JOIN uploads u ON sl.upload_id = u.id 
     WHERE sl.user_id = ? 
     ORDER BY sl.created_at DESC`,
    [session.user.id]
  );
  const uploads = query<any>("SELECT id, original_name, file_name FROM uploads WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [session.user.id]);
  const systemSettings = query<any>("SELECT * FROM system_settings LIMIT 1")[0];
  return { links, uploads, systemSettings };
}

export default function ShortLinksPage() {
  const { links, uploads, systemSettings } = useLoaderData<typeof loader>();
  const { toast } = useToast();
  const revalidator = useRevalidator();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [createTab, setCreateTab] = useState<"file" | "url">("file");
  const [externalUrl, setExternalUrl] = useState("");

  const base = systemSettings?.base_url || (typeof window !== "undefined" ? window.location.origin : "");

  const createShortLink = async (uploadId: string) => {
    const res = await fetch("/api/short-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ upload_id: uploadId }),
    });
    if (res.ok) {
      const d = await res.json();
      navigator.clipboard.writeText(`${base}/s/${d.code}`);
      toast({ title: "Short link created & copied!" });
      setShowCreate(false);
      setSearch("");
      revalidator.revalidate();
    } else {
      const d = await res.json();
      toast({ title: "Error", description: d.error, variant: "destructive" });
    }
  };

  const createExternalShortLink = async () => {
    if (!externalUrl.trim()) return;
    const res = await fetch("/api/short-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ external_url: externalUrl.trim() }),
    });
    if (res.ok) {
      const d = await res.json();
      navigator.clipboard.writeText(`${base}/s/${d.code}`);
      toast({ title: "Short link created & copied!" });
      setShowCreate(false);
      setExternalUrl("");
      revalidator.revalidate();
    }
  };

  const deleteShortLink = async (id: string) => {
    const res = await fetch("/api/short-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      revalidator.revalidate();
      toast({ title: "Short link deleted" });
    }
  };

  const copyShortLink = (code: string) => {
    navigator.clipboard.writeText(`${base}/s/${code}`);
    toast({ title: "Link copied!" });
  };

  const filteredUploads = uploads.filter((u: any) =>
    u.original_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-1">Short Links</h1>
          <p className="text-muted-foreground text-sm">Create and manage short links to your files</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-5 py-2.5 rounded-md font-semibold transition-all flex items-center gap-2"
        >
          New Short Link
        </button>
      </div>

      {/* Links table */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        {links.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">No short links yet. Create one for any of your files or an external URL.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold text-muted-foreground">
              <div className="col-span-4">File</div>
              <div className="col-span-3">Short Link</div>
              <div className="col-span-1 text-center">Clicks</div>
              <div className="col-span-2">Created</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {links.map((link: any) => (
              <div key={link.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
                <div className="col-span-4 truncate">
                  {link.external_url ? (
                    <>
                      <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                        External URL
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{link.external_url}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground truncate">{link.original_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{link.file_name}</p>
                    </>
                  )}
                </div>
                <div className="col-span-3">
                  <code className="text-xs bg-white/5 text-foreground px-2 py-1 rounded border border-border font-mono">/s/{link.code}</code>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-sm font-mono text-muted-foreground">{link.clicks ?? 0}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">{formatRelativeDate(link.created_at)}</span>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <button
                    onClick={() => copyShortLink(link.code)}
                    className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    title="Copy link"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => deleteShortLink(link.id)}
                    className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Create Short Link</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 w-full overflow-hidden">
          <div className="flex gap-2 mt-2">
            <button onClick={() => setCreateTab("file")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${createTab === "file" ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-muted-foreground border border-border hover:bg-white/10"}`}>
              File
            </button>
            <button onClick={() => setCreateTab("url")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${createTab === "url" ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-muted-foreground border border-border hover:bg-white/10"}`}>
              External URL
            </button>
          </div>
          {createTab === "file" && (
            <div className="space-y-3 mt-2">
              <input type="text" placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm" />
              <div className="max-h-72 overflow-y-auto overflow-x-hidden space-y-0.5 rounded-lg border border-border bg-background p-2">
                {filteredUploads.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No files found</p>
                ) : (
                  filteredUploads.slice(0, 50).map((u: any) => (
                    <button key={u.id} onClick={() => createShortLink(u.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors group overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-border flex items-center justify-center shrink-0">
                        <Icon name="description" className="text-base text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="text-sm text-foreground truncate group-hover:text-foreground transition-colors">{u.original_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.file_name}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          {createTab === "url" && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <label htmlFor="sl-destination-url-1" className="text-sm font-medium text-muted-foreground">Destination URL</label>
                <input id="sl-destination-url-1" type="url" placeholder="https://example.com" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createExternalShortLink()}
                  className="block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm" />
              </div>
              <button onClick={createExternalShortLink} disabled={!externalUrl.trim()}
                className="w-full py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-[var(--primary-hover)] rounded-lg transition-all disabled:opacity-50">
                Create Short Link
              </button>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

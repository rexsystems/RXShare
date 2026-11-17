import { useState, useRef, useCallback, useEffect } from "react";
import { useLoaderData, useRevalidator, useOutletContext } from "react-router";
import { getSession } from "~/.server/session";
import { query, queryOne, execute } from "~/.server/db";
import { formatFileSize, formatRelativeDate, getMimeCategory } from "~/lib/utils-format";
import { cn } from "~/lib/utils";
import { useToast } from "~/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { btnPrimary, btnSecondary, controlClass, PasswordField, SelectField, TextAreaField, TextField } from "~/components/form";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { AudioPlayer } from "~/components/AudioPlayer";
import { getCsrfToken } from "~/lib/csrf";
import { isAdmin } from "~/.server/auth";
import { getFeatureFlagsMap } from "~/.server/features";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });
  const uploads = query<any>("SELECT * FROM uploads WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [session.user.id]);
  const settings = queryOne<any>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
  const systemSettings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  const featureFlags = getFeatureFlagsMap(isAdmin(session.user.id));

  // Reconcile disk_used with actual upload sizes to self-heal any drift
  if (settings) {
    const actual = uploads.reduce((acc: number, u: any) => acc + u.file_size, 0);
    if (settings.disk_used !== actual) {
      execute("UPDATE user_settings SET disk_used = ? WHERE user_id = ?", [actual, session.user.id]);
      settings.disk_used = actual;
    }
  }

  return { uploads, settings, systemSettings, featureFlags };
}

export default function UploadsPage() {
  const { uploads, settings, systemSettings, featureFlags } = useLoaderData<typeof loader>();
  const { user } = useOutletContext<any>();
  const { toast } = useToast();
  const revalidator = useRevalidator();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [settingsFile, setSettingsFile] = useState<any>(null);
  const [filePassword, setFilePassword] = useState("");
  const [fileExpiry, setFileExpiry] = useState("");
  const [fileDescription, setFileDescription] = useState("");
  const [folders, setFolders] = useState<any[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [moveToFolderFile, setMoveToFolderFile] = useState<any>(null);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderDialogName, setNewFolderDialogName] = useState("");
  const [focusIndex, setFocusIndex] = useState(-1);
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 24;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredUploads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredUploads.map((u: any) => u.id)));
  };

  const downloadZip = async () => {
    if (selectedIds.size === 0) return;
    setZipping(true);
    try {
      const res = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "rxshare-download.zip"; a.click();
      URL.revokeObjectURL(url);
      setSelectedIds(new Set());
    } catch (err: any) { toast({ title: "Zip failed", description: err.message, variant: "destructive" }); }
    finally { setZipping(false); }
  };

  const filteredUploads = uploads.filter((u: any) => {
    const matchesSearch = u.original_name.toLowerCase().includes(search.toLowerCase()) || u.file_name.toLowerCase().includes(search.toLowerCase());
    const matchesFolder = !activeFolder || u.folder_id === activeFolder;
    const matchesType = !filterType || getMimeCategory(u.mime_type) === filterType;
    const matchesStatus = !filterStatus || (filterStatus === "public" ? u.is_public : !u.is_public);
    return matchesSearch && matchesFolder && matchesType && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUploads.length / perPage);
  const paginatedUploads = filteredUploads.slice((page - 1) * perPage, page * perPage);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterType, filterStatus, activeFolder]);

  const totalSize = uploads.reduce((acc: number, u: any) => acc + u.file_size, 0);
  const quota = settings?.disk_quota || 1073741824;
  const usagePercent = Math.min((totalSize / quota) * 100, 100);

  const handleUpload = useCallback(async (file: globalThis.File) => {
    if (!settings) return;
    if (file.size > settings.max_upload_size) {
      toast({ title: "File too large", description: `Max size: ${formatFileSize(settings.max_upload_size)}`, variant: "destructive" }); return;
    }
    if (totalSize + file.size > quota) { toast({ title: "Quota exceeded", variant: "destructive" }); return; }
    setUploading(true); setUploadProgress(0);
    try {
      const formData = new FormData(); formData.append("file", file);
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) setUploadProgress((e.loaded / e.total) * 100); });
        xhr.addEventListener("load", () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(JSON.parse(xhr.responseText)?.error || "Upload failed")); });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("POST", "/api/upload");
        const csrfToken = getCsrfToken();
        if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
        xhr.send(formData);
      });
      revalidator.revalidate(); toast({ title: "File uploaded!", description: file.name });
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setUploading(false); setUploadProgress(0); }
  }, [settings, totalSize, quota, revalidator, toast]);

  // Ctrl+V paste upload for images/gifs
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            const named = new File([file], `paste-${Date.now()}.${ext}`, { type: file.type });
            handleUpload(named);
          }
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleUpload]);

  const copyLink = (fileName: string) => {
    const base = systemSettings?.base_url || window.location.origin;
    const path = settings?.custom_path || `v`;
    navigator.clipboard.writeText(`${base}/${path}/${fileName}`);
    toast({ title: "Link copied!" });
  };
  const deleteUpload = async (upload: any) => {
    const res = await fetch(`/api/delete/${upload.id}`, { method: "DELETE", headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) } });
    if (res.ok) { revalidator.revalidate(); toast({ title: "File deleted" }); }
  };

  // Fetch folders
  useEffect(() => {
    fetch("/api/folders").then(r => r.json()).then(d => { if (d.folders) setFolders(d.folders); }).catch(() => {});
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setFocusIndex(i => Math.min(i + 1, filteredUploads.length - 1)); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && focusIndex >= 0) { e.preventDefault(); setPreviewFile(filteredUploads[focusIndex]); }
      if (e.key === "Escape") { setPreviewFile(null); setSelectedIds(new Set()); setFocusIndex(-1); }
      if (e.key === "x" && focusIndex >= 0) { e.preventDefault(); toggleSelect(filteredUploads[focusIndex].id); }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectAll(); }
      if (e.key === "u") { e.preventDefault(); fileInputRef.current?.click(); }
      if (e.key === "g") { e.preventDefault(); setViewMode("grid"); }
      if (e.key === "l") { e.preventDefault(); setViewMode("list"); }
      if (e.key === "Delete" && focusIndex >= 0) { e.preventDefault(); deleteUpload(filteredUploads[focusIndex]); }
      if (e.key === "c" && focusIndex >= 0) { e.preventDefault(); copyLink(filteredUploads[focusIndex].file_name); }
      if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        document.getElementById("file-search")?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusIndex, filteredUploads, selectAll, toggleSelect, deleteUpload, copyLink]);

  const saveFileSettings = async () => {
    if (!settingsFile) return;
    const updates: any = {};
    if (fileExpiry) updates.expires_at = new Date(Date.now() + parseInt(fileExpiry) * 3600000).toISOString();
    if (fileExpiry === "0") updates.expires_at = null;
    if (filePassword !== undefined) updates.password = filePassword || null;
    if (fileDescription !== undefined) updates.description = fileDescription || null;
    const res = await fetch(`/api/uploads/${settingsFile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify(updates),
    });
    if (res.ok) { setSettingsFile(null); setFilePassword(""); setFileExpiry(""); setFileDescription(""); revalidator.revalidate(); toast({ title: "File settings updated" }); }
  };

  const createFolder = async () => {
    const name = newFolderDialogName.trim() || newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const d = await res.json();
      setFolders(prev => [d, ...prev]);
      setNewFolderName("");
      setNewFolderDialogName("");
      toast({ title: "Folder created" });
    }
  };

  const deleteFolder = async (folderId: string) => {
    const res = await fetch("/api/folders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id: folderId }),
    });
    if (res.ok) {
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (activeFolder === folderId) setActiveFolder(null);
      toast({ title: "Folder deleted" });
    }
  };

  const moveToFolder = async (uploadId: string, folderId: string | null) => {
    await fetch(`/api/uploads/${uploadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ folder_id: folderId }),
    });
    revalidator.revalidate();
    toast({ title: folderId ? "Moved to folder" : "Removed from folder" });
  };

  const uploadMany = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) await handleUpload(f);
  }, [handleUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    if (e.dataTransfer.files.length) void uploadMany(e.dataTransfer.files);
  }, [uploadMany]);

  const createShortLink = async (uploadId: string, fileName: string) => {
    const res = await fetch("/api/short-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ upload_id: uploadId }),
    });
    if (res.ok) {
      const d = await res.json();
      const base = systemSettings?.base_url || window.location.origin;
      navigator.clipboard.writeText(`${base}/s/${d.code}`);
      toast({ title: "Short link copied!" });
    }
  };
  const toggleVisibility = async (upload: any) => {
    const res = await fetch(`/api/uploads/${upload.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ is_public: upload.is_public ? 0 : 1 }) });
    if (res.ok) { revalidator.revalidate(); toast({ title: upload.is_public ? "Made private" : "Made public" }); }
  };

  const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "FILE");
  const hasFilters = !!(search || filterType || filterStatus || activeFolder);
  const allSelected = filteredUploads.length > 0 && selectedIds.size === filteredUploads.length;
  const totalViews = uploads.reduce((a: number, u: any) => a + (u.views || 0), 0);
  const totalDownloads = uploads.reduce((a: number, u: any) => a + (u.downloads || 0), 0);
  const clearFilters = () => { setSearch(""); setFilterType(""); setFilterStatus(""); setActiveFolder(null); };

  const actionsMenu = (upload: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${upload.original_name}`} className="min-h-9 min-w-9 rounded-md border border-border bg-background px-2 text-sm hover:bg-white/5">
          •••
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => copyLink(upload.file_name)}>Copy link</DropdownMenuItem>
        {featureFlags.short_links && <DropdownMenuItem onClick={() => createShortLink(upload.id, upload.file_name)}>Copy short link</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => toggleVisibility(upload)}>{upload.is_public ? "Make private" : "Make public"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setSettingsFile(upload); setFilePassword(""); setFileExpiry(""); setFileDescription(upload.description || ""); }}>File settings</DropdownMenuItem>
        {featureFlags.folders && <DropdownMenuItem onClick={() => setMoveToFolderFile(upload)}>{upload.folder_id ? "Change folder" : "Move to folder"}</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => deleteUpload(upload)} className="text-red-400 focus:text-red-300">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const statusText = (u: any) => (
    <span className="text-xs text-muted-foreground">{u.is_public ? "Public" : "Private"}{u.password_hash ? ", password" : ""}{u.expires_at ? ", expires" : ""}</span>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <div className="flex gap-1.5"><dt>Files</dt><dd className="text-foreground">{uploads.length}</dd></div>
            <div className="flex gap-1.5"><dt>Views</dt><dd className="text-foreground">{totalViews.toLocaleString()}</dd></div>
            <div className="flex gap-1.5"><dt>Downloads</dt><dd className="text-foreground">{totalDownloads.toLocaleString()}</dd></div>
          </dl>
        </div>
        <div className="w-full sm:w-72">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Storage</span>
            <span>{formatFileSize(totalSize)} of {formatFileSize(quota)}</span>
          </div>
          <div
            role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usagePercent)}
            className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-white/10"
          >
            <div className={cn("h-full rounded-sm", usagePercent > 90 ? "bg-red-400" : "bg-primary")} style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" aria-label="Choose files to upload" onChange={(e) => { if (e.target.files?.length) void uploadMany(e.target.files); e.target.value = ""; }} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn("flex flex-col items-start justify-between gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center", dragActive ? "border-primary bg-primary/5" : "border-[var(--control-border)]")}
      >
        {uploading ? (
          <div role="status" className="w-full">
            <p className="text-sm">Uploading… {Math.round(uploadProgress)}%</p>
            <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress)} className="mt-2 h-1.5 overflow-hidden rounded-sm bg-white/10">
              <div className="h-full bg-primary" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Drop files here, paste an image, or choose files. Up to {formatFileSize(settings?.max_upload_size || 104857600)} each.
            </p>
            <button type="button" className={btnPrimary} onClick={() => fileInputRef.current?.click()}>Choose files</button>
          </>
        )}
      </div>

      {featureFlags.folders && (
        <div role="group" aria-label="Folders" className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={!activeFolder} onClick={() => setActiveFolder(null)}
            className={cn("min-h-9 rounded-md border px-3 text-sm", !activeFolder ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
            All files
          </button>
          {folders.map((f: any) => (
            <span key={f.id} className="inline-flex items-center">
              <button type="button" aria-pressed={activeFolder === f.id} onClick={() => setActiveFolder(f.id)}
                className={cn("min-h-9 rounded-l-md border px-3 text-sm", activeFolder === f.id ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
                {f.name} <span className="text-muted-foreground">({uploads.filter((u: any) => u.folder_id === f.id).length})</span>
              </button>
              <button type="button" onClick={() => deleteFolder(f.id)} aria-label={`Delete folder ${f.name}`}
                className="min-h-9 rounded-r-md border border-l-0 border-border px-2 text-sm text-muted-foreground hover:text-red-400">×</button>
            </span>
          ))}
          <button type="button" onClick={() => { setNewFolderDialogName(""); setShowNewFolderDialog(true); }} className="min-h-9 rounded-md border border-dashed border-[var(--control-border)] px-3 text-sm text-muted-foreground hover:text-foreground">
            New folder
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1 sm:max-w-sm">
          <label htmlFor="file-search" className="sr-only">Search files</label>
          <input id="file-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files (press /)" className={controlClass} />
        </div>
        {featureFlags.advanced_search && (
          <>
            <label className="sr-only" htmlFor="filter-type">File type</label>
            <select id="filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)} className={cn(controlClass, "w-auto")}>
              <option value="">All types</option><option value="image">Images</option><option value="video">Video</option><option value="audio">Audio</option>
              <option value="text">Text</option><option value="code">Code</option><option value="pdf">PDF</option><option value="other">Other</option>
            </select>
            <label className="sr-only" htmlFor="filter-status">Visibility</label>
            <select id="filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cn(controlClass, "w-auto")}>
              <option value="">Any visibility</option><option value="public">Public</option><option value="private">Private</option>
            </select>
          </>
        )}
        <div role="group" aria-label="Layout" className="ml-auto flex overflow-hidden rounded-md border border-[var(--control-border)]">
          <button type="button" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")} className={cn("min-h-11 px-3 text-sm sm:min-h-9", viewMode === "grid" ? "bg-white/10" : "text-muted-foreground hover:text-foreground")}>Grid</button>
          <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={cn("min-h-11 border-l border-[var(--control-border)] px-3 text-sm sm:min-h-9", viewMode === "list" ? "bg-white/10" : "text-muted-foreground hover:text-foreground")}>List</button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm">
          <span>{selectedIds.size} selected</span>
          {featureFlags.zip_download && <button type="button" onClick={downloadZip} disabled={zipping} className="min-h-9 text-primary underline underline-offset-2 disabled:opacity-60">{zipping ? "Zipping…" : "Download as zip"}</button>}
          <button type="button" onClick={() => setSelectedIds(new Set())} className="min-h-9 text-muted-foreground hover:text-foreground">Clear selection</button>
        </div>
      )}

      {filteredUploads.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-14 text-center">
          {uploads.length === 0 ? (
            <>
              <p className="font-medium">No files yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Drop a file above, paste an image, or press U to choose one.</p>
            </>
          ) : (
            <>
              <p className="font-medium">No files match</p>
              <p className="mt-1 text-sm text-muted-foreground">Nothing fits the current search or filters.</p>
              {hasFilters && <button type="button" onClick={clearFilters} className="mt-3 min-h-11 text-sm text-primary underline underline-offset-2">Clear search and filters</button>}
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginatedUploads.map((upload: any, i: number) => {
            const isImage = getMimeCategory(upload.mime_type) === "image";
            const globalIndex = (page - 1) * perPage + i;
            return (
              <li key={upload.id} className={cn("relative flex flex-col overflow-hidden rounded-lg border bg-card", selectedIds.has(upload.id) ? "border-primary" : "border-border", focusIndex === globalIndex && "outline outline-2 outline-primary")}>
                <label className="absolute left-2 top-2 z-10 flex size-9 items-center justify-center rounded-md bg-background/90">
                  <input type="checkbox" checked={selectedIds.has(upload.id)} onChange={() => toggleSelect(upload.id)} aria-label={`Select ${upload.original_name}`} className="size-4 accent-[var(--primary)]" />
                </label>
                <div className="absolute right-2 top-2 z-10">{actionsMenu(upload)}</div>
                <button type="button" onClick={() => setPreviewFile(upload)} className="flex flex-1 flex-col text-left">
                  <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-white/[0.04]">
                    {isImage ? (
                      <img src={`/api/files/${upload.thumbnail_path || upload.file_path}`} alt="" loading="lazy" width={300} height={225} className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-mono text-2xl text-muted-foreground">{ext(upload.original_name)}</span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="truncate text-sm font-medium" title={upload.original_name}>{upload.original_name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(upload.file_size)} · {formatRelativeDate(upload.created_at)}</p>
                    {statusText(upload)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allSelected} onChange={selectAll} aria-label="Select all files" className="size-4 accent-[var(--primary)]" />
                </th>
                <th scope="col" className="px-3 py-3 font-medium">Name</th>
                <th scope="col" className="px-3 py-3 font-medium">Size</th>
                <th scope="col" className="px-3 py-3 font-medium">Visibility</th>
                <th scope="col" className="px-3 py-3 font-medium">Uploaded</th>
                <th scope="col" className="w-14 px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedUploads.map((upload: any, i: number) => (
                <tr key={upload.id} className={cn(selectedIds.has(upload.id) && "bg-primary/5", focusIndex === (page - 1) * perPage + i && "outline outline-2 -outline-offset-2 outline-primary")}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.has(upload.id)} onChange={() => toggleSelect(upload.id)} aria-label={`Select ${upload.original_name}`} className="size-4 accent-[var(--primary)]" /></td>
                  <td className="max-w-xs px-3 py-2">
                    <button type="button" onClick={() => setPreviewFile(upload)} className="block min-h-9 max-w-full text-left">
                      <span className="block truncate font-medium">{upload.original_name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{upload.file_name}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatFileSize(upload.file_size)}</td>
                  <td className="px-3 py-2">{upload.is_public ? "Public" : "Private"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatRelativeDate(upload.created_at)}</td>
                  <td className="px-3 py-2 text-right">{actionsMenu(upload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredUploads.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 text-sm text-muted-foreground">
          <p>Showing {paginatedUploads.length} of {filteredUploads.length}</p>
          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex items-center gap-2">
              <button type="button" className={btnSecondary} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
              <span aria-live="polite">Page {page} of {totalPages}</span>
              <button type="button" className={btnSecondary} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </nav>
          )}
        </div>
      )}
      <p className="pb-4 text-xs text-muted-foreground">Shortcuts: / search, U upload, G grid, L list, J and K move, Enter open, X select, C copy link, Delete remove.</p>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl">
          {previewFile && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{previewFile.original_name}</DialogTitle>
                <DialogDescription>
                  {formatFileSize(previewFile.file_size)} · {formatRelativeDate(previewFile.created_at)} · {previewFile.views} views
                </DialogDescription>
              </DialogHeader>
              <FilePreview upload={previewFile} />
              <div className="flex flex-wrap gap-2">
                <a href={`/v/${previewFile.file_name}`} className={btnSecondary}>Open page</a>
                <button type="button" onClick={() => copyLink(previewFile.file_name)} className={btnSecondary}>Copy link</button>
                <a href={`/api/files/${previewFile.file_path}`} download={previewFile.original_name} className={btnPrimary}>Download</a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!settingsFile} onOpenChange={() => setSettingsFile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">File settings</DialogTitle>
            <DialogDescription className="truncate">{settingsFile?.original_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {featureFlags.file_expiration && (
              <div>
                <SelectField fieldId="fs-expiry" label="Expiration" value={fileExpiry} onChange={setFileExpiry}
                  options={[{ value: "", label: "No change" }, { value: "1", label: "1 hour" }, { value: "24", label: "24 hours" }, { value: "168", label: "7 days" }, { value: "720", label: "30 days" }, { value: "0", label: "Remove expiration" }]} />
                {settingsFile?.expires_at && <p className="mt-1.5 text-xs text-muted-foreground">Currently expires {new Date(settingsFile.expires_at).toLocaleString()}.</p>}
              </div>
            )}
            {featureFlags.password_protection && (
              <PasswordField fieldId="fs-password" label="Password" optional value={filePassword} onChange={setFilePassword}
                placeholder={settingsFile?.password_hash ? "Type a new one to change it" : "No password"}
                hint={settingsFile?.password_hash ? "This file is password protected. Leave empty to keep it." : undefined} />
            )}
            {featureFlags.folders && folders.length > 0 && (
              <SelectField fieldId="fs-folder" label="Folder" value={settingsFile?.folder_id || ""} onChange={(v) => moveToFolder(settingsFile.id, v || null)}
                options={[{ value: "", label: "No folder" }, ...folders.map((f: any) => ({ value: f.id, label: f.name }))]} />
            )}
            {featureFlags.file_notes && <TextAreaField fieldId="fs-notes" label="Description" optional value={fileDescription} onChange={setFileDescription} placeholder="A note shown with the file" />}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setSettingsFile(null)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={saveFileSettings}>Save</button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription className="sr-only">Enter a name for the new folder.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (newFolderDialogName.trim()) { createFolder(); setShowNewFolderDialog(false); } }} className="space-y-4">
            <TextField fieldId="nf-name" label="Folder name" value={newFolderDialogName} onChange={setNewFolderDialogName} autoFocus autoComplete="off" />
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setShowNewFolderDialog(false)}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={!newFolderDialogName.trim()}>Create folder</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveToFolderFile} onOpenChange={() => setMoveToFolderFile(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move file</DialogTitle>
            <DialogDescription className="truncate">{moveToFolderFile?.original_name}</DialogDescription>
          </DialogHeader>
          {folders.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no folders yet. Create one first.</p>
          ) : (
            <div role="group" aria-label="Folders" className="max-h-64 space-y-1 overflow-y-auto">
              {[{ id: null as string | null, name: "No folder" }, ...folders].map((f: any) => (
                <button key={f.id ?? "none"} type="button" aria-pressed={(moveToFolderFile?.folder_id || null) === f.id}
                  onClick={() => { moveToFolder(moveToFolderFile.id, f.id); setMoveToFolderFile(null); }}
                  className={cn("flex min-h-11 w-full items-center rounded-md border px-3 text-left text-sm", (moveToFolderFile?.folder_id || null) === f.id ? "border-primary bg-primary/10" : "border-border hover:bg-white/5")}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilePreview({ upload }: { upload: any }) {
  const url = `/api/files/${upload.file_path}`;
  const category = getMimeCategory(upload.mime_type);
  if (category === "image") return <img src={url} alt={upload.original_name} className="mx-auto max-h-[60vh] max-w-full rounded object-contain" />;
  if (category === "video") return <video src={url} controls className="mx-auto max-h-[60vh] max-w-full rounded" />;
  if (category === "audio") return <AudioPlayer src={url} title={upload.original_name} />;
  if (category === "pdf") return <iframe src={url} title={upload.original_name} className="h-[60vh] w-full rounded border border-border" />;
  return <p className="py-10 text-center text-sm text-muted-foreground">No preview for this file type. Use Download or Open page.</p>;
}

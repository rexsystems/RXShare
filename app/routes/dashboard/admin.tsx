import { useState, useEffect } from "react";
import { useLoaderData, useOutletContext, useRevalidator } from "react-router";
import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query, queryOne } from "~/.server/db";
import { formatFileSize, getAvatarUrl } from "~/lib/utils-format";
import { cn } from "~/lib/utils";
import { useToast } from "~/components/ui/use-toast";
import { Icon } from "~/components/Icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Switch } from "~/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { getCsrfToken } from "~/lib/csrf";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  const users = query<any>("SELECT u.*, us.disk_quota, us.disk_used, us.is_admin, us.is_active, us.max_upload_size, us.avatar_url, us.invite_quota, us.invites_used FROM users u LEFT JOIN user_settings us ON u.id = us.user_id ORDER BY u.created_at");
  const allUploads = query<any>("SELECT id, user_id, file_size FROM uploads");
  const systemSettings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  return { users, allUploads, systemSettings, currentUserId: session.user.id };
}

export default function AdminPage() {
  const { users, allUploads, systemSettings, currentUserId } = useLoaderData<typeof loader>();
  const { toast } = useToast();
  const revalidator = useRevalidator();
  const [activeTab, setActiveTab] = useState("users");

  const tabs = [
    { id: "analytics", label: "Analytics", icon: "analytics" },
    { id: "users", label: "Users", icon: "manage_accounts" },
    { id: "settings", label: "General", icon: "settings" },
    { id: "security", label: "Security", icon: "shield" },
    { id: "design", label: "Design", icon: "palette" },
    { id: "audit", label: "Audit Log", icon: "history" },
    { id: "webhooks", label: "Webhooks", icon: "webhook" },
    { id: "invites", label: "Invites", icon: "mail" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-foreground mb-1">Admin Panel</h1>
        <p className="text-muted-foreground text-sm">Manage users, settings, and design</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav role="tablist" aria-label="Admin sections" className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("min-h-11 shrink-0 border-b-2 px-1 text-sm transition-colors",
                activeTab === tab.id
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "analytics" && <AnalyticsTab users={users} allUploads={allUploads} />}
      {activeTab === "users" && <UsersTab users={users} allUploads={allUploads} currentUserId={currentUserId} toast={toast} revalidator={revalidator} />}
      {activeTab === "settings" && <SettingsTab systemSettings={systemSettings} toast={toast} revalidator={revalidator} />}
      {activeTab === "security" && <SecurityTab systemSettings={systemSettings} toast={toast} revalidator={revalidator} />}
      {activeTab === "design" && <DesignTab systemSettings={systemSettings} toast={toast} revalidator={revalidator} />}
      {activeTab === "audit" && <AuditTab toast={toast} />}
      {activeTab === "webhooks" && <WebhooksTab toast={toast} />}
      {activeTab === "invites" && <InvitesTab toast={toast} systemSettings={systemSettings} users={users} revalidator={revalidator} />}
      {activeTab === "features" && <FeaturesTab toast={toast} />}
    </div>
  );
}

function UsersTab({ users, allUploads, currentUserId, toast, revalidator }: any) {
  const [search, setSearch] = useState("");
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [editQuota, setEditQuota] = useState("");
  const [editMaxUpload, setEditMaxUpload] = useState("");
  const [editInviteQuota, setEditInviteQuota] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createIsAdmin, setCreateIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = users.filter((u: any) =>
    (u.username || "").toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const getUserUploadCount = (userId: string) => allUploads.filter((u: any) => u.user_id === userId).length;

  const toggleAdmin = async (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ is_admin: user.is_admin ? 0 : 1 }) });
    if (res.ok) { revalidator.revalidate(); toast({ title: user.is_admin ? "Admin removed" : "Admin granted" }); }
  };

  const toggleActive = async (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }) });
    if (res.ok) { revalidator.revalidate(); toast({ title: user.is_active ? "User deactivated" : "User activated" }); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: "DELETE", headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) } });
    if (res.ok) { setDeleteUser(null); revalidator.revalidate(); toast({ title: "User deleted" }); }
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    const updates: any = {};
    if (editQuota) updates.disk_quota = parseInt(editQuota) * 1024 * 1024;
    if (editMaxUpload) updates.max_upload_size = parseInt(editMaxUpload) * 1024 * 1024;
    if (editInviteQuota !== "") updates.invite_quota = parseInt(editInviteQuota) || 0;
    const res = await fetch(`/api/admin/users/${editUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify(updates) });
    if (res.ok) { setEditUser(null); revalidator.revalidate(); toast({ title: "User settings updated" }); }
  };

  const handleCreateUser = async () => {
    if (!createEmail || !createUsername || !createPassword) {
      toast({ title: "All fields are required", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email: createEmail, username: createUsername, password: createPassword, is_admin: createIsAdmin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false); setCreateEmail(""); setCreateUsername(""); setCreatePassword(""); setCreateIsAdmin(false);
      revalidator.revalidate(); toast({ title: "User created" });
    } catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const inputCls = "block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm transition-all";

  return (
    <div className="space-y-6 mt-6">
      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <input className="block w-full pl-4 pr-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-card text-foreground placeholder:text-muted-foreground/80 text-sm"
            aria-label="Search users" placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2">
          Create User
        </button>
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 border-b border-border text-xs font-semibold text-muted-foreground">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Storage</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((u: any) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="group hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={cn("w-10 h-10 rounded-full p-0.5", u.is_admin === 1 ? "" : "bg-gray-800")}>
                          <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                            <img alt="" className="w-full h-full object-cover opacity-90" src={getAvatarUrl(u.username || u.email, 80, u.avatar_url)} />
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{u.username || u.email}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {u.is_admin === 1 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-muted-foreground border border-border">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", u.is_active !== 0 ? "bg-green-500" : "bg-red-600")} />
                      <span className={cn("text-sm", u.is_active !== 0 ? "text-foreground" : "text-red-400")}>{u.is_active !== 0 ? "Active" : "Suspended"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground">{formatFileSize(u.disk_used || 0)}</div>
                    <div className="text-xs text-muted-foreground">{getUserUploadCount(u.id)} files</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditUser(u); setEditQuota(String(Math.round((u.disk_quota || 0) / 1024 / 1024))); setEditMaxUpload(String(Math.round((u.max_upload_size || 0) / 1024 / 1024))); setEditInviteQuota(String(u.invite_quota || 0)); }}
                        className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground">Edit</button>
                      {!isSelf && (
                        <>
                          <button onClick={() => toggleAdmin(u.id)}
                            className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground">{u.is_admin ? "Remove admin" : "Make admin"}</button>
                          <button onClick={() => toggleActive(u.id)}
                            className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground">{u.is_active !== 0 ? "Deactivate" : "Activate"}</button>
                          <button onClick={() => setDeleteUser(u)}
                            className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-400">Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-6 py-4 border-t border-border bg-white/[0.02]">
          <div className="text-xs text-muted-foreground">Showing <span className="text-foreground font-medium">{filtered.length}</span> of <span className="text-foreground font-medium">{users.length}</span> users</div>
        </div>
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Delete user?</DialogTitle><DialogDescription className="text-muted-foreground">This will delete all uploads and data for {deleteUser?.username || deleteUser?.email}. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteUser(null)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit {editUser?.username || editUser?.email}{editUser?.id === currentUserId ? " (You)" : ""}</DialogTitle>
            {editUser?.id === currentUserId && (
              <DialogDescription className="text-muted-foreground">You can only modify your quota and upload limits.</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label htmlFor="ad-disk-quota-mb-1" className="text-sm font-medium text-muted-foreground">Disk Quota (MB)</label><input id="ad-disk-quota-mb-1" type="number" value={editQuota} onChange={(e) => setEditQuota(e.target.value)} className={inputCls} /></div>
            <div className="space-y-2"><label htmlFor="ad-max-upload-size-mb-2" className="text-sm font-medium text-muted-foreground">Max Upload Size (MB)</label><input id="ad-max-upload-size-mb-2" type="number" value={editMaxUpload} onChange={(e) => setEditMaxUpload(e.target.value)} className={inputCls} /></div>
            {editUser?.id !== currentUserId && (
              <div className="space-y-2">
                <label htmlFor="ad-invite-quota-3" className="text-sm font-medium text-muted-foreground">Invite Quota</label>
                <input id="ad-invite-quota-3" type="number" value={editInviteQuota} onChange={(e) => setEditInviteQuota(e.target.value)} className={inputCls} placeholder="0" />
                <p className="text-xs text-muted-foreground">How many invites this user can create. 0 = none.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setEditUser(null)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleEditSave} className="px-4 py-2 text-sm text-primary-foreground bg-primary hover:bg-[var(--primary-hover)] rounded-lg transition-all">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User dialog */}
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Create User</DialogTitle><DialogDescription className="text-muted-foreground">Add a new user to the system.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label htmlFor="ad-email-4" className="text-sm font-medium text-muted-foreground">Email</label><input id="ad-email-4" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} className={inputCls} placeholder="user@example.com" /></div>
            <div className="space-y-2"><label htmlFor="ad-username-5" className="text-sm font-medium text-muted-foreground">Username</label><input id="ad-username-5" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} className={inputCls} placeholder="username" /></div>
            <div className="space-y-2"><label htmlFor="ad-password-6" className="text-sm font-medium text-muted-foreground">Password</label><input id="ad-password-6" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} className={inputCls} placeholder="••••••••" /></div>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-foreground">Admin</p><p className="text-xs text-muted-foreground">Grant admin privileges</p></div>
              <Switch aria-label="Make this user an admin" checked={createIsAdmin} onCheckedChange={setCreateIsAdmin} />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleCreateUser} disabled={creating} className="px-4 py-2 text-sm text-primary-foreground bg-primary hover:bg-[var(--primary-hover)] rounded-lg transition-all disabled:opacity-50">{creating ? "Creating..." : "Create"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTab({ systemSettings, toast, revalidator }: any) {
  const [siteName, setSiteName] = useState(systemSettings?.site_name || "RXShare");
  const [siteDesc, setSiteDesc] = useState(systemSettings?.site_description || "");
  const [baseUrl, setBaseUrl] = useState(systemSettings?.base_url || "");
  const [allowReg, setAllowReg] = useState(systemSettings?.allow_registration !== 0);
  const [allowLogin, setAllowLogin] = useState(systemSettings?.allow_login !== 0);
  const [showPoweredBy, setShowPoweredBy] = useState(systemSettings?.show_powered_by !== 0);
  const [defaultQuota, setDefaultQuota] = useState(String(Math.round((systemSettings?.default_quota || 1073741824) / 1024 / 1024)));
  const [maxUpload, setMaxUpload] = useState(String(Math.round((systemSettings?.max_upload_size || 104857600) / 1024 / 1024)));
  const [defaultInviteQuota, setDefaultInviteQuota] = useState(String(systemSettings?.default_invite_quota || 0));
  const [resendApiKey, setResendApiKey] = useState(systemSettings?.resend_api_key || "");
  const [emailFrom, setEmailFrom] = useState(systemSettings?.email_from || "");

  const save = async () => {
    const res = await fetch("/api/admin/system-settings", {
      method: "PUT", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({
        site_name: siteName, site_description: siteDesc, base_url: baseUrl || null,
        allow_registration: allowReg ? 1 : 0, allow_login: allowLogin ? 1 : 0,
        default_quota: parseInt(defaultQuota) * 1024 * 1024, max_upload_size: parseInt(maxUpload) * 1024 * 1024,
        show_powered_by: showPoweredBy ? 1 : 0,
        default_invite_quota: parseInt(defaultInviteQuota) || 0,
        resend_api_key: resendApiKey || null,
        email_from: emailFrom || null,
      }),
    });
    if (res.ok) { revalidator.revalidate(); toast({ title: "Settings saved!" }); }
  };

  const inputCls = "block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm transition-all";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">General Settings</h3>
        <div className="space-y-2"><label htmlFor="ad-site-name-7" className="text-sm font-medium text-muted-foreground">Site Name</label><input id="ad-site-name-7" value={siteName} onChange={(e) => setSiteName(e.target.value)} className={inputCls} /></div>
        <div className="space-y-2"><label htmlFor="ad-site-description-8" className="text-sm font-medium text-muted-foreground">Site Description</label><input id="ad-site-description-8" value={siteDesc} onChange={(e) => setSiteDesc(e.target.value)} className={inputCls} /></div>
        <div className="space-y-2"><label htmlFor="ad-base-url-9" className="text-sm font-medium text-muted-foreground">Base URL</label><input id="ad-base-url-9" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls} placeholder="https://share.example.com" /></div>
        <div className="h-px bg-white/5" />
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium text-foreground">Allow Registration</p><p className="text-xs text-muted-foreground">Let new users sign up</p></div>
          <Switch aria-label="Allow registration" checked={allowReg} onCheckedChange={setAllowReg} />
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium text-foreground">Allow Login</p><p className="text-xs text-muted-foreground">Enable/disable login page</p></div>
          <Switch aria-label="Allow login" checked={allowLogin} onCheckedChange={setAllowLogin} />
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium text-foreground">Show "Powered by RXShare"</p><p className="text-xs text-muted-foreground">Display credit badge on viewer pages</p></div>
          <Switch aria-label="Show the RXShare link on shared pages" checked={showPoweredBy} onCheckedChange={setShowPoweredBy} />
        </div>
        <div className="h-px bg-white/5" />
        <div className="space-y-2"><label htmlFor="ad-default-quota-mb-10" className="text-sm font-medium text-muted-foreground">Default Quota (MB)</label><input id="ad-default-quota-mb-10" type="number" value={defaultQuota} onChange={(e) => setDefaultQuota(e.target.value)} className={inputCls} /><p className="text-xs text-muted-foreground">{formatFileSize(parseInt(defaultQuota || "0") * 1024 * 1024)}</p></div>
        <div className="space-y-2"><label htmlFor="ad-max-upload-size-mb-11" className="text-sm font-medium text-muted-foreground">Max Upload Size (MB)</label><input id="ad-max-upload-size-mb-11" type="number" value={maxUpload} onChange={(e) => setMaxUpload(e.target.value)} className={inputCls} /><p className="text-xs text-muted-foreground">{formatFileSize(parseInt(maxUpload || "0") * 1024 * 1024)}</p></div>
        <div className="space-y-2"><label htmlFor="ad-default-invite-quota-12" className="text-sm font-medium text-muted-foreground">Default Invite Quota</label><input id="ad-default-invite-quota-12" type="number" value={defaultInviteQuota} onChange={(e) => setDefaultInviteQuota(e.target.value)} className={inputCls} min="0" /><p className="text-xs text-muted-foreground">Invites given to new users on registration. 0 = none.</p></div>
        <div className="h-px bg-white/5" />
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">Email (Resend)</h4>
        <p className="text-xs text-muted-foreground -mt-4">Required for forgot password and email notifications. Get an API key from <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">resend.com</a></p>
        <div className="space-y-2"><label htmlFor="ad-resend-api-key-13" className="text-sm font-medium text-muted-foreground">Resend API Key</label><input id="ad-resend-api-key-13" type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} className={inputCls} placeholder="re_..." /></div>
        <div className="space-y-2"><label htmlFor="ad-from-address-14" className="text-sm font-medium text-muted-foreground">From Address</label><input id="ad-from-address-14" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} className={inputCls} placeholder="RXShare <noreply@yourdomain.com>" /><p className="text-xs text-muted-foreground">Must be a verified domain in Resend, or use noreply@resend.dev for testing</p></div>
        <button onClick={save} className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-8 py-3 rounded-md font-semibold transition-all flex items-center gap-2">Save Configuration</button>
      </section>
    </div>
  );
}

function DesignTab({ systemSettings, toast, revalidator }: any) {
  const [layout, setLayout] = useState(systemSettings?.dashboard_layout || "sidebar");
  const [logoUrl, setLogoUrl] = useState(systemSettings?.logo_url || "");
  const [primaryColor, setPrimaryColor] = useState(systemSettings?.primary_color || "#f97316");
  const [bgPattern, setBgPattern] = useState(systemSettings?.background_pattern || "grid");
  const [uploading, setUploading] = useState(false);
  const [userControlledLayout, setUserControlledLayout] = useState(systemSettings?.user_controlled_layout === 1);

  const layouts = [
    { id: "header", label: "Header Layout", icon: "monitor", desc: "Navigation on top" },
    { id: "sidebar", label: "Sidebar Layout", icon: "view_sidebar", desc: "Vertical navigation" },
    { id: "floating", label: "Floating Dock", icon: "dock_to_bottom", desc: "Modern detached nav" },
  ];

  const patterns = [
    { id: "grid", label: "Grid", icon: "grid_4x4" },
    { id: "dots", label: "Dots", icon: "blur_on" },
    { id: "triangles", label: "Triangles", icon: "change_history" },
    { id: "crosshatch", label: "Crosshatch", icon: "tag" },
    { id: "diagonal", label: "Diagonal", icon: "texture" },
    { id: "hexagons", label: "Hexagons", icon: "hexagon" },
    { id: "none", label: "None", icon: "block" },
  ];

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please upload an image", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/logo", { method: "POST", body: formData, headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogoUrl(data.url);
      toast({ title: "Logo uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const save = async () => {
    const res = await fetch("/api/admin/system-settings", {
      method: "PUT", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ dashboard_layout: layout, logo_url: logoUrl || null, primary_color: primaryColor, background_pattern: bgPattern, user_controlled_layout: userControlledLayout ? 1 : 0 }),
    });
    if (res.ok) { revalidator.revalidate(); toast({ title: "Design saved! Reload to see changes." }); }
  };

  const inputCls = "block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm transition-all";

  return (
    <div className="mt-6 space-y-8 max-w-3xl">
      {/* Layout picker */}
      <section className="bg-card border border-border rounded-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">Dashboard Layout</h3>
        </div>
        <div className="flex items-center justify-between mb-6 p-4 bg-white/[0.03] border border-border rounded-md">
          <div><p className="text-sm font-medium text-foreground">User-Controlled Layout</p><p className="text-xs text-muted-foreground">Let each user pick their own dashboard layout</p></div>
          <Switch aria-label="Let each user pick their own layout" checked={userControlledLayout} onCheckedChange={setUserControlledLayout} />
        </div>
        {userControlledLayout && (
          <div className="mb-6 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-center gap-2">
            <p className="text-xs text-yellow-400/80">Users control their own layout. The selection below is the default for new users.</p>
          </div>
        )}
        <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6", userControlledLayout && "opacity-50 pointer-events-none")}>
          {layouts.map((l) => (
            <label key={l.id} className="cursor-pointer group relative">
              <input type="radio" name="layout" className="peer sr-only" checked={layout === l.id} onChange={() => setLayout(l.id)} />
              <div className={cn(
                "bg-card border rounded-lg p-6 flex flex-col items-center justify-center gap-4 transition-all h-48 relative overflow-hidden",
                layout === l.id ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-[var(--control-border)]"
              )}>
                
                <div className="text-center relative z-10">
                  <span className={cn("block font-semibold", layout === l.id ? "text-primary" : "text-foreground")}>{l.label}</span>
                  <span className="text-xs text-muted-foreground mt-1">{l.desc}</span>
                </div>
              </div>
              {layout === l.id && <div className="absolute top-4 right-4 text-primary z-20">✓</div>}
            </label>
          ))}
        </div>
      </section>

      {/* Branding */}
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">Background Pattern</h3>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {patterns.map((p) => (
            <label key={p.id} className="cursor-pointer group relative">
              <input type="radio" name="bgPattern" className="peer sr-only" checked={bgPattern === p.id} onChange={() => setBgPattern(p.id)} />
              <div className={cn(
                "bg-card border rounded-md p-4 flex flex-col items-center justify-center gap-3 transition-all h-28 relative overflow-hidden",
                bgPattern === p.id ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-[var(--control-border)]"
              )}>
                <div className={cn("absolute inset-0 opacity-30", `bg-pattern-${p.id}`)} />
                <span className={cn("text-sm font-medium relative z-10", bgPattern === p.id ? "text-primary" : "text-muted-foreground")}>{p.label}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Branding & Assets */}
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">Branding & Assets</h3>
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-3 block">Application Logo</label>
          <div className="flex items-start gap-4">
            {logoUrl && (
              <div className="w-20 h-20 rounded-md bg-card border border-border flex items-center justify-center overflow-hidden shrink-0">
                <img src={logoUrl.startsWith("/api/logo") ? `${logoUrl}?t=${Date.now()}` : logoUrl} alt="Logo preview" className="w-full h-full object-contain p-1" />
              </div>
            )}
            <label className="w-20 h-20 rounded-md bg-card border border-dashed border-gray-600 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer shrink-0">
              <span className="text-[10px] font-semibold">{uploading ? "..." : "Upload"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
            </label>
            <div className="flex-1 space-y-3">
              <input aria-label="Application logo URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputCls} placeholder="https://example.com/logo.png" />
              <p className="text-xs text-muted-foreground">Recommended: 512x512px. Supports PNG, SVG, JPG. Leave empty for default.</p>
              {logoUrl && <button onClick={() => setLogoUrl("")} className="text-xs text-red-400 hover:underline">Remove logo</button>}
            </div>
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="bg-card border border-border rounded-lg p-8 space-y-6 relative overflow-hidden">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2 relative z-10">Color Theme</h3>
        <div className="relative z-10">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Primary Color</label>
            <div className="flex items-center gap-3">
              <label className="relative w-10 h-10 rounded-lg border border-border shrink-0 cursor-pointer overflow-hidden group" style={{ backgroundColor: primaryColor, boxShadow: `0 0 15px ${primaryColor}40` }}>
                <input type="color" aria-label="Primary color picker" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                </div>
              </label>
              <input aria-label="Primary color hex value" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputCls + " w-32 font-mono"} />
            </div>
          </div>
        </div>
        {/* Live preview */}
        <div className="bg-background rounded-md border border-[var(--control-border)] p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
          
          <div className="text-xs text-muted-foreground absolute top-3 left-3 flex items-center gap-1">Preview</div>
          <button className="relative text-foreground px-8 py-3 rounded-lg font-semibold transition-all overflow-hidden" style={{ backgroundColor: primaryColor }}>
            <span className="relative z-10">Example Button</span>
          </button>
          <div className="flex gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, borderColor: `${primaryColor}30` }}>Badge</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-muted-foreground border border-gray-700">Inactive</span>
          </div>
          <div className="w-full max-w-[200px]">
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: primaryColor, boxShadow: `0 0 10px ${primaryColor}80` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4 pb-12">
        <button onClick={save} className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-8 py-3.5 rounded-md font-semibold transition-all flex items-center gap-2">Save Configuration</button>
        <button className="text-muted-foreground hover:text-foreground px-6 py-3.5 rounded-md font-medium border border-transparent hover:border-border transition-all">Reset to Defaults</button>
      </div>
    </div>
  );
}

function AuditTab({ toast }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/audit?page=${page}`).then(r => r.json()).then(d => { setLogs(d.logs || []); setLoading(false); }).catch(() => setLoading(false));
  }, [page]);

  const actionColors: Record<string, string> = {
    upload: "text-green-400", delete: "text-red-400", login: "text-blue-400",
    "user.create": "text-primary", "user.delete": "text-red-400",
    "folder.create": "text-yellow-400", "webhook.create": "text-purple-400",
    "invite.create": "text-pink-400", "invite.use": "text-emerald-400",
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 border-b border-border text-xs font-semibold text-muted-foreground">
              <th className="px-6 py-4">Action</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">IP</th>
              <th className="px-6 py-4">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No audit logs yet</td></tr>
            ) : logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="px-6 py-3"><span className={cn("text-sm font-medium", actionColors[log.action] || "text-foreground")}>{log.action}</span></td>
                <td className="px-6 py-3 text-sm text-foreground">{log.username || "system"}</td>
                <td className="px-6 py-3 text-sm text-muted-foreground truncate max-w-[200px]">{log.details || "-"}</td>
                <td className="px-6 py-3 text-xs text-muted-foreground font-mono">{log.ip_address || "-"}</td>
                <td className="px-6 py-3 text-xs text-muted-foreground">{log.created_at ? new Date(log.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-white/[0.02]">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-white/5 disabled:opacity-30">Previous</button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50}
            className="px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-white/5 disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}

function WebhooksTab({ toast }: any) {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("upload,delete");

  useEffect(() => {
    fetch("/api/admin/webhooks").then(r => r.json()).then(d => setWebhooks(d.webhooks || [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!name.trim() || !url.trim()) { toast({ title: "Name and URL required", variant: "destructive" }); return; }
    const res = await fetch("/api/admin/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ name: name.trim(), url: url.trim(), events }),
    });
    const d = await res.json();
    if (res.ok) { setWebhooks(prev => [{ ...d, name: name.trim(), url: url.trim(), events, is_active: 1 }, ...prev]); setName(""); setUrl(""); toast({ title: "Webhook created" }); }
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id }),
    });
    setWebhooks(prev => prev.filter(w => w.id !== id));
    toast({ title: "Webhook deleted" });
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/admin/webhooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id, is_active: active ? 1 : 0 }),
    });
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: active ? 1 : 0 } : w));
  };

  const inputCls = "block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">Create Webhook</h3>
        <div className="space-y-4">
          <div className="space-y-2"><label htmlFor="ad-name-15" className="text-sm font-medium text-muted-foreground">Name</label><input id="ad-name-15" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Discord notifications" /></div>
          <div className="space-y-2"><label htmlFor="ad-url-16" className="text-sm font-medium text-muted-foreground">URL</label><input id="ad-url-16" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://discord.com/api/webhooks/..." /></div>
          <div className="space-y-2"><label htmlFor="ad-events-comma-separated-17" className="text-sm font-medium text-muted-foreground">Events (comma-separated)</label><input id="ad-events-comma-separated-17" value={events} onChange={(e) => setEvents(e.target.value)} className={inputCls} placeholder="upload,delete,login,signup" /><p className="text-xs text-muted-foreground">Available: upload, delete, login, signup, user.create, user.delete, * (all)</p></div>
          <button onClick={create} className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-6 py-2.5 rounded-md font-semibold transition-all">Create Webhook</button>
        </div>
      </section>
      {webhooks.length > 0 && (
        <section className="space-y-3">
          {webhooks.map((w: any) => (
            <div key={w.id} className="bg-card border border-border rounded-md p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{w.name}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">{w.url}</p>
                <p className="text-xs text-muted-foreground mt-1">Events: {w.events}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch aria-label={`Webhook ${w.name || w.url} active`} checked={w.is_active === 1} onCheckedChange={(v) => toggle(w.id, v)} />
                <button onClick={() => remove(w.id)} className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-400">Delete</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function InvitesTab({ toast, systemSettings, users, revalidator }: any) {
  const [invites, setInvites] = useState<any[]>([]);
  const [maxUses, setMaxUses] = useState("1");
  const [expiresHours, setExpiresHours] = useState("72");
  const [bulkQuota, setBulkQuota] = useState("5");

  useEffect(() => {
    fetch("/api/admin/invites").then(r => r.json()).then(d => setInvites(d.invites || [])).catch(() => {});
  }, []);

  const create = async () => {
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ max_uses: parseInt(maxUses) || 1, expires_hours: parseInt(expiresHours) || null }),
    });
    const d = await res.json();
    if (res.ok) {
      const base = systemSettings?.base_url || window.location.origin;
      const link = `${base}/auth/sign-up?invite=${d.code}`;
      navigator.clipboard.writeText(link);
      setInvites(prev => [{ ...d, max_uses: parseInt(maxUses) || 1, uses: 0, created_at: new Date().toISOString() }, ...prev]);
      toast({ title: "Invite created & link copied!" });
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id }),
    });
    setInvites(prev => prev.filter(i => i.id !== id));
    toast({ title: "Invite deleted" });
  };

  const inputCls = "block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">Create Invite</h3>
        <p className="text-sm text-muted-foreground -mt-4">Invite links allow users to register even when registration is disabled.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><label htmlFor="ad-max-uses-18" className="text-sm font-medium text-muted-foreground">Max Uses</label><input id="ad-max-uses-18" type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inputCls} /></div>
          <div className="space-y-2"><label htmlFor="ad-expires-hours-19" className="text-sm font-medium text-muted-foreground">Expires (hours)</label><input id="ad-expires-hours-19" type="number" value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} className={inputCls} placeholder="Leave empty for no expiry" /></div>
        </div>
        <button onClick={create} className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-6 py-2.5 rounded-md font-semibold transition-all flex items-center gap-2">
          Generate Invite Link
        </button>
      </section>
      {invites.length > 0 && (
        <section className="space-y-3">
          {invites.map((inv: any) => {
            const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
            const full = inv.uses >= inv.max_uses;
            return (
              <div key={inv.id} className={cn("bg-card border border-border rounded-md p-4 flex items-center justify-between", (expired || full) && "opacity-50")}>
                <div>
                  <p className="text-sm font-mono text-foreground">{inv.code}</p>
                  <p className="text-xs text-muted-foreground">{inv.uses}/{inv.max_uses} uses{inv.created_by_name && ` • by ${inv.created_by_name}`}{inv.used_by_name && ` • used by ${inv.used_by_name}`}</p>
                  {expired && <p className="text-xs text-red-400">Expired</p>}
                  {full && !expired && <p className="text-xs text-yellow-400">Fully used</p>}
                  {inv.expires_at && !expired && <p className="text-xs text-muted-foreground">Expires: {new Date(inv.expires_at).toLocaleString()}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const base = systemSettings?.base_url || window.location.origin; navigator.clipboard.writeText(`${base}/auth/sign-up?invite=${inv.code}`); toast({ title: "Link copied!" }); }}
                    className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground">Copy</button>
                  <button onClick={() => remove(inv.id)} className="min-h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-400">Delete</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Per-user invite quotas */}
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">User Invite Quotas</h3>
        <p className="text-sm text-muted-foreground -mt-4">Give users their own invite allowance. They can generate invites from their settings page.</p>
        
        <div className="flex items-center gap-3">
          <input type="number" aria-label="Invite quota for all users" value={bulkQuota} onChange={(e) => setBulkQuota(e.target.value)} className={inputCls + " w-24"} min="0" />
          <button onClick={async () => {
            const quota = parseInt(bulkQuota) || 0;
            for (const u of users) {
              await fetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ invite_quota: quota }) });
            }
            revalidator.revalidate();
            toast({ title: `Set ${quota} invites for all users` });
          }} className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2">
            Set for All Users
          </button>
        </div>

        <div className="space-y-2">
          {users.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-border rounded-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                  <img alt="" className="w-full h-full object-cover" src={getAvatarUrl(u.username || u.email, 32, u.avatar_url)} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{u.username || u.email}</p>
                  <p className="text-xs text-muted-foreground">{u.invites_used || 0} / {u.invite_quota || 0} used</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" aria-label="Invite quota" min="0" className="w-16 px-2 py-1.5 text-sm text-center border border-[var(--control-border)] rounded-lg bg-background text-foreground"
                  defaultValue={u.invite_quota || 0}
                  onBlur={async (e) => {
                    const val = parseInt(e.target.value) || 0;
                    if (val === (u.invite_quota || 0)) return;
                    await fetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ invite_quota: val }) });
                    revalidator.revalidate();
                    toast({ title: `Updated invite quota for ${u.username || u.email}` });
                  }} />
                <button onClick={async () => {
                  await fetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ invites_used: 0 }) });
                  revalidator.revalidate();
                  toast({ title: `Reset invites for ${u.username || u.email}` });
                }} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all" title="Reset used count">
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AnalyticsTab({ users, allUploads }: { users: any[]; allUploads: any[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rc, setRc] = useState<any>(null);
  const [range, setRange] = useState("month");

  const fetchData = (r: string) => {
    setLoading(true);
    fetch(`/api/admin/analytics?range=${r}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(range);
    import("recharts").then(setRc);
  }, []);

  const handleRangeChange = (r: string) => {
    setRange(r);
    fetchData(r);
  };

  if (!rc || (!data && loading)) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <Icon name="progress_activity" className="text-4xl text-primary animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="mt-6 text-center py-20 text-muted-foreground">Failed to load analytics data.</div>;
  }

  const { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = rc;
  const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#22c55e", "#ec4899"];

  // Fill gaps so the chart shows zero for days with no uploads
  const rawUploads: { date: string; count: number; size: number }[] = data.uploadsPerDay || [];
  const fillDays = (raw: typeof rawUploads): typeof rawUploads => {
    const numDays = range === "day" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 0;
    if (raw.length === 0 && numDays > 0) {
      const result: typeof rawUploads = [];
      const now = new Date();
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        result.push({ date: d.toISOString().slice(0, 10), count: 0, size: 0 });
      }
      return result;
    }
    if (raw.length === 0) return raw;
    if (range === "lifetime") {
      const first = new Date(raw[0].date); const last = new Date(raw[raw.length - 1].date);
      if (Math.ceil((last.getTime() - first.getTime()) / 86400000) > 365) return raw;
    }
    const map = new Map(raw.map((d) => [d.date, d]));
    const sorted = [...raw].sort((a, b) => a.date.localeCompare(b.date));
    const start = numDays > 0 ? new Date(Date.now() - numDays * 86400000) : new Date(sorted[0].date);
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const result: typeof rawUploads = [];
    const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      result.push(map.get(key) || { date: key, count: 0, size: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  };

  const uploadsPerDay = fillDays(rawUploads);
  const topUploaders = data.topUploaders || [];
  const typeDistribution = data.typeDistribution || [];

  const typeCategories: Record<string, number> = {};
  typeDistribution.forEach((t: any) => {
    const mime = (t.mime_type || "").toLowerCase();
    let cat = "Other";
    if (mime.startsWith("image/")) cat = "Image";
    else if (mime.startsWith("video/")) cat = "Video";
    else if (mime.startsWith("audio/")) cat = "Audio";
    else if (mime.startsWith("application/pdf") || mime.startsWith("text/") || mime.includes("document") || mime.includes("spreadsheet") || mime.includes("presentation")) cat = "Document";
    typeCategories[cat] = (typeCategories[cat] || 0) + t.count;
  });
  const pieData = Object.entries(typeCategories).map(([name, value]) => ({ name, value }));
  const rangeUploads = uploadsPerDay.reduce((acc: number, d: any) => acc + d.count, 0);
  const rangeStorage = uploadsPerDay.reduce((acc: number, d: any) => acc + (d.size || 0), 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-medium">
            {p.name}: {p.name === "Storage" ? formatFileSize(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  };

  const rangeLabels: Record<string, string> = { day: "Today", week: "This Week", month: "This Month", lifetime: "All Time" };
  const rangeLabel = rangeLabels[range] || "This Month";
  const RangeDropdown = () => (
    <Select value={range} onValueChange={handleRangeChange}>
      <SelectTrigger className="w-auto h-auto gap-1.5 px-2.5 py-1 text-xs bg-white/5 border-border text-muted-foreground rounded-lg hover:bg-white/10 hover:text-foreground transition-colors">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        <SelectItem value="day" className="text-xs text-foreground focus:bg-white/10 focus:text-foreground">Today</SelectItem>
        <SelectItem value="week" className="text-xs text-foreground focus:bg-white/10 focus:text-foreground">This Week</SelectItem>
        <SelectItem value="month" className="text-xs text-foreground focus:bg-white/10 focus:text-foreground">This Month</SelectItem>
        <SelectItem value="lifetime" className="text-xs text-foreground focus:bg-white/10 focus:text-foreground">All Time</SelectItem>
      </SelectContent>
    </Select>
  );

  const totalUsers = users.length;
  const activeUsersCount = users.filter((u: any) => u.is_active !== 0).length;
  const totalUploadsCount = allUploads.length;
  const totalStorageUsed = users.reduce((acc: number, u: any) => acc + (u.disk_used || 0), 0);
  const formatXTick = (v: string) => {
    if (range === "lifetime" && uploadsPerDay.length > 60) return v.slice(0, 7);
    return v.slice(5);
  };
  const xInterval = uploadsPerDay.length > 14 ? Math.floor(uploadsPerDay.length / 7) : 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { icon: "group", label: "Total Users", value: String(totalUsers), color: "text-primary" },
          { icon: "wifi", label: "Active Users", value: String(activeUsersCount), color: "text-green-500" },
          { icon: "cloud_upload", label: "Total Uploads", value: String(totalUploadsCount), color: "text-blue-500" },
          { icon: "storage", label: "Storage Used", value: formatFileSize(totalStorageUsed), color: "text-purple-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border p-6 rounded-lg relative overflow-hidden group hover:border-primary/30 transition-all">
            <div className="text-muted-foreground text-sm font-medium mb-2">{stat.label}</div>
            <div className="text-3xl font-semibold text-foreground tracking-tight">{stat.value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { icon: "visibility", label: "Views", value: (data.totalViews ?? 0).toLocaleString(), color: "text-primary" },
          { icon: "download", label: "Downloads", value: (data.totalDownloads ?? 0).toLocaleString(), color: "text-blue-500" },
          { icon: "cloud_upload", label: "Uploads", value: String(rangeUploads), color: "text-purple-500" },
          { icon: "storage", label: "Storage Added", value: formatFileSize(rangeStorage), color: "text-green-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border p-6 rounded-lg relative overflow-hidden group hover:border-primary/30 transition-all">
            <div className="text-muted-foreground text-sm font-medium mb-2">{stat.label}</div>
            <div className="text-3xl font-semibold text-foreground tracking-tight">{stat.value}</div>
            <div className="absolute bottom-3 right-3"><span className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">{rangeLabel}</span></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">Uploads</h3>
            <RangeDropdown />
          </div>
          {uploadsPerDay.length === 0 ? <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">No data for this period</div> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={uploadsPerDay}>
                <defs><linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={formatXTick} interval={xInterval} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="Uploads" stroke="#f97316" fill="url(#uploadGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">Storage Growth</h3>
            <RangeDropdown />
          </div>
          {uploadsPerDay.length === 0 ? <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">No data for this period</div> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={uploadsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={formatXTick} interval={xInterval} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => formatFileSize(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="size" name="Storage" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">Top Uploaders</h3>
            <span className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">{rangeLabel}</span>
          </div>
          {topUploaders.length === 0 ? <p className="text-muted-foreground text-sm">No upload data for this period.</p> : (
            <div className="space-y-3">
              {topUploaders.map((u: any, i: number) => (
                <div key={u.username} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: COLORS[i % COLORS.length] + "20", color: COLORS[i % COLORS.length] }}>{i + 1}</span>
                    <span className="text-foreground font-medium text-sm">{u.username}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-foreground text-sm font-medium">{u.count} files</span>
                    <span className="text-muted-foreground text-xs ml-2">({formatFileSize(u.size || 0)})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">File Types</h3>
            <span className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">{rangeLabel}</span>
          </div>
          {pieData.length === 0 ? <p className="text-muted-foreground text-sm">No upload data for this period.</p> : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {pieData.map((entry: any, i: number) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="text-foreground font-medium ml-auto">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SecurityTab({ systemSettings, toast, revalidator }: any) {
  const [provider, setProvider] = useState(systemSettings?.captcha_provider || "none");
  const [siteKey, setSiteKey] = useState(systemSettings?.captcha_site_key || "");
  const [secretKey, setSecretKey] = useState(systemSettings?.captcha_secret_key || "");
  const [onLogin, setOnLogin] = useState(!!systemSettings?.captcha_on_login);
  const [onSignup, setOnSignup] = useState(!!systemSettings?.captcha_on_signup);
  const [onUpload, setOnUpload] = useState(!!systemSettings?.captcha_on_upload);

  const providers = [
    { id: "none", label: "Disabled", icon: "block", desc: "No CAPTCHA verification" },
    { id: "recaptcha", label: "reCAPTCHA v2", icon: "security", desc: "Google reCAPTCHA" },
    { id: "turnstile", label: "Turnstile", icon: "shield", desc: "Cloudflare Turnstile" },
    { id: "hcaptcha", label: "hCaptcha", icon: "verified_user", desc: "hCaptcha" },
  ];

  const docsUrl: Record<string, string> = {
    recaptcha: "https://www.google.com/recaptcha/admin",
    turnstile: "https://dash.cloudflare.com/?to=/:account/turnstile",
    hcaptcha: "https://dashboard.hcaptcha.com/signup",
  };

  const save = async () => {
    if (provider !== "none" && (!siteKey.trim() || !secretKey.trim())) {
      toast({ title: "Site Key and Secret Key are required", variant: "destructive" });
      return;
    }
    const res = await fetch("/api/admin/system-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({
        captcha_provider: provider,
        captcha_site_key: provider !== "none" ? siteKey.trim() : null,
        captcha_secret_key: provider !== "none" ? secretKey.trim() : null,
        captcha_on_login: onLogin ? 1 : 0,
        captcha_on_signup: onSignup ? 1 : 0,
        captcha_on_upload: onUpload ? 1 : 0,
      }),
    });
    if (res.ok) { revalidator.revalidate(); toast({ title: "Security settings saved!" }); }
    else toast({ title: "Failed to save", variant: "destructive" });
  };

  const inputCls = "block w-full px-4 py-2.5 border border-[var(--control-border)] rounded-lg bg-background text-foreground placeholder:text-muted-foreground/80 text-sm transition-all";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-card border border-border rounded-lg p-8 space-y-6">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
          CAPTCHA Protection
        </h3>
        <p className="text-sm text-muted-foreground">
          Protect forms from bots and abuse. Choose a CAPTCHA provider and configure where it should be enforced.
          API token requests (ShareX, etc.) bypass CAPTCHA automatically.
        </p>

        {/* Provider selection */}
        <div className="grid grid-cols-2 gap-3">
          {providers.map((p) => (
            <button key={p.id} onClick={() => setProvider(p.id)}
              className={cn(
                "p-4 rounded-md border text-left transition-all",
                provider === p.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-border"
              )}>
              <div className="flex items-center gap-3 mb-1">
                <span className={cn("font-semibold text-sm", provider === p.id ? "text-foreground" : "text-foreground")}>{p.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{p.desc}</p>
            </button>
          ))}
        </div>

        {/* Keys */}
        {provider !== "none" && (
          <div className="space-y-4">
            {docsUrl[provider] && (
              <p className="text-xs text-muted-foreground">
                Get your keys from{" "}
                <a href={docsUrl[provider]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {provider === "recaptcha" ? "Google reCAPTCHA Admin" : provider === "turnstile" ? "Cloudflare Dashboard" : "hCaptcha Dashboard"}
                </a>
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="ad-site-key-20" className="text-sm font-medium text-muted-foreground">Site Key</label>
              <input id="ad-site-key-20" value={siteKey} onChange={(e) => setSiteKey(e.target.value)} className={inputCls} placeholder="Enter site key" />
            </div>
            <div className="space-y-2">
              <label htmlFor="ad-secret-key-21" className="text-sm font-medium text-muted-foreground">Secret Key</label>
              <input id="ad-secret-key-21" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className={inputCls} placeholder="Enter secret key" />
            </div>

            <div className="h-px bg-white/5" />

            {/* Enforcement toggles */}
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Enforce CAPTCHA on:</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Login</p>
                  <p className="text-xs text-muted-foreground">Protect against credential stuffing</p>
                </div>
                <Switch aria-label="Require CAPTCHA on login" checked={onLogin} onCheckedChange={setOnLogin} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Sign Up</p>
                  <p className="text-xs text-muted-foreground">Prevent automated account creation</p>
                </div>
                <Switch aria-label="Require CAPTCHA on sign-up" checked={onSignup} onCheckedChange={setOnSignup} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">File Upload</p>
                  <p className="text-xs text-muted-foreground">Block automated uploads (API tokens bypass this)</p>
                </div>
                <Switch aria-label="Require CAPTCHA on upload" checked={onUpload} onCheckedChange={setOnUpload} />
              </div>
            </div>
          </div>
        )}

        <button onClick={save}
          className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground px-8 py-3 rounded-md font-semibold transition-all flex items-center gap-2">
          Save Security Settings
        </button>
      </section>
    </div>
  );
}

function FeaturesTab({ toast }: any) {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFlags = () => {
    fetch("/api/admin/features")
      .then((r) => r.json())
      .then((d) => setFlags(d.flags || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFlags(); }, []);

  const toggle = async (key: string, field: "enabled" | "members_enabled", current: number) => {
    const flag = flags.find((f: any) => f.key === key);
    if (!flag) return;
    const body: any = { key, enabled: !!flag.enabled, members_enabled: !!flag.members_enabled };
    body[field] = !current;
    const csrf = getCsrfToken();
    const res = await fetch("/api/admin/features", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setFlags((prev) => prev.map((f) => f.key === key ? { ...f, [field]: current ? 0 : 1 } : f));
      toast({ title: "Updated", description: `${flag.label} ${field === "enabled" ? (current ? "disabled" : "enabled") : (current ? "restricted to admin" : "enabled for members")}` });
    }
  };

  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <Icon name="progress_activity" className="text-4xl text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-muted-foreground text-sm mb-4">Enable or disable features globally. When a feature is enabled, you can also control whether regular members have access or only admins.</p>
      <div className="grid gap-3">
        {flags.map((flag: any) => (
          <div key={flag.key} className="bg-card border border-border rounded-md p-5 flex items-center justify-between gap-4 hover:border-border transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium text-sm">{flag.label}</span>
                {!flag.enabled && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">OFF</span>}
                {flag.enabled && !flag.members_enabled && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-medium">ADMIN ONLY</span>}
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">{flag.description}</p>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Enabled</span>
                <Switch aria-label={`${flag.label} enabled`} checked={!!flag.enabled} onCheckedChange={() => toggle(flag.key, "enabled", flag.enabled)} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Members</span>
                <Switch aria-label={`${flag.label} available to members`} checked={!!flag.members_enabled} disabled={!flag.enabled} onCheckedChange={() => toggle(flag.key, "members_enabled", flag.members_enabled)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


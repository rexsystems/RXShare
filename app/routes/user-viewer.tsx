import { useLoaderData } from "react-router";
import { query, queryOne } from "~/.server/db";
import { formatFileSize, getMimeCategory } from "~/lib/utils-format";
import { PublicFileList } from "~/components/PublicFileList";
import { btnPrimary } from "~/components/form";

export async function loader({ params }: { params: { username: string; fileName?: string } }) {
  let user = queryOne<any>("SELECT u.id, u.username FROM users u WHERE u.username = ?", [params.username]);
  if (!user) {
    const byPath = queryOne<any>("SELECT u.id, u.username FROM users u JOIN user_settings us ON u.id = us.user_id WHERE us.custom_path = ?", [params.username]);
    if (byPath) user = byPath;
  }
  if (!user) throw new Response("Not Found", { status: 404 });
  const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");

  if (params.fileName) {
    const upload = queryOne<any>("SELECT * FROM uploads WHERE user_id = ? AND file_name = ? AND is_public = 1", [user.id, params.fileName]);
    if (!upload) throw new Response("Not Found", { status: 404 });
    return { type: "file" as const, upload, user, backgroundPattern: sys?.background_pattern || "none" };
  }

  const uploads = query<any>("SELECT * FROM uploads WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC", [user.id]);
  return { type: "list" as const, uploads, user, backgroundPattern: sys?.background_pattern || "none" };
}

export function meta({ loaderData: data }: { loaderData?: any }) {
  if (!data) return [{ title: "Not Found" }];
  if (data.type === "file") return [{ title: data.upload.original_name }];
  return [{ title: `${data.user.username}'s files` }];
}

export default function UserViewer() {
  const data = useLoaderData<typeof loader>();

  if (data.type === "file") {
    const { upload } = data;
    const fileUrl = `/api/files/${upload.file_path}`;
    const category = getMimeCategory(upload.mime_type);
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl space-y-4 px-5 py-8 sm:px-8">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{upload.original_name}</h1>
              <p className="text-sm text-muted-foreground">{formatFileSize(upload.file_size)} · {upload.views} views</p>
            </div>
            <a href={fileUrl} download={upload.original_name} className={btnPrimary}>Download</a>
          </header>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {category === "image" && <img src={fileUrl} alt={upload.original_name} className="mx-auto max-h-[80vh] max-w-full object-contain" />}
            {category === "video" && <video src={fileUrl} controls className="mx-auto max-h-[80vh] max-w-full" />}
            {category === "audio" && <div className="p-8"><audio src={fileUrl} controls className="w-full" /></div>}
            {!["image", "video", "audio"].includes(category) && (
              <p className="px-6 py-14 text-center text-sm text-muted-foreground">No preview for this file type. Use Download.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-background text-foreground"><PublicFileList username={data.user.username} uploads={data.uploads} /></div>;
}

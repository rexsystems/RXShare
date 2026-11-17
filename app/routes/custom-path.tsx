import { query, queryOne } from "~/.server/db";
import { useLoaderData } from "react-router";
import { getBaseUrl } from "~/.server/base-url";
import { PublicFileList } from "~/components/PublicFileList";


export async function loader({ params, request }: { params: { customPath: string; fileName?: string }; request: Request }) {
  const { customPath, fileName } = params;

  // Look up user by custom_path
  const row = queryOne<any>(
    "SELECT u.id, u.username, us.embed_title, us.embed_description, us.embed_color, us.embed_author, us.embed_site_name, us.embed_logo_url FROM users u JOIN user_settings us ON u.id = us.user_id WHERE us.custom_path = ?",
    [customPath]
  );
  if (!row) throw new Response("Not Found", { status: 404 });

  const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
  const baseUrl = getBaseUrl(request);

  if (fileName) {
    const upload = queryOne<any>("SELECT file_name FROM uploads WHERE user_id = ? AND file_name = ? AND is_public = 1", [row.id, fileName]);
    if (!upload) throw new Response("Not Found", { status: 404 });
    // Redirect to the main viewer so the page looks identical
    return new Response(null, { status: 302, headers: { Location: `/v/${upload.file_name}` } });
  }

  const uploads = query<any>("SELECT * FROM uploads WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC", [row.id]);
  return { type: "list" as const, uploads, user: row, baseUrl, primaryColor: sys?.primary_color || null, backgroundPattern: sys?.background_pattern || "none" };
}

export function meta({ loaderData: data }: { loaderData: any }) {
  if (!data) return [{ title: "Not Found" }];
  if (data.type === "list" && data.user) {
    return [
      { title: `${data.user.username}'s files` },
      { name: "description", content: `${data.uploads?.length || 0} public files` },
    ];
  }
  return [{ title: "Not Found" }];
}

export default function CustomPathViewer() {
  const data = useLoaderData<typeof loader>();
  return <div className="min-h-screen bg-background text-foreground"><PublicFileList username={data.user.username} uploads={data.uploads} /></div>;
}

import { formatFileSize, getMimeCategory } from "~/lib/utils-format";

interface PublicFileListProps {
  username: string;
  uploads: any[];
}

/** Public gallery of one user's shared files. Plain cards, real links. */
export function PublicFileList({ username, uploads }: PublicFileListProps) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{username}'s files</h1>
        <p className="mt-1 text-sm text-muted-foreground">{uploads.length} public {uploads.length === 1 ? "file" : "files"}</p>
      </header>

      {uploads.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border px-6 py-14 text-center">
          <p className="font-medium">Nothing shared yet</p>
          <p className="mt-1 text-sm text-muted-foreground">{username} has no public files.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {uploads.map((upload) => {
            const isImage = getMimeCategory(upload.mime_type) === "image";
            const ext = upload.original_name.includes(".") ? upload.original_name.split(".").pop()!.toUpperCase().slice(0, 5) : "FILE";
            return (
              <li key={upload.id}>
                <a href={`/v/${upload.file_name}`} className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-[var(--control-border)]">
                  <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-white/[0.04]">
                    {isImage ? (
                      <img src={`/api/files/${upload.thumbnail_path || upload.file_path}`} alt="" loading="lazy" width={300} height={225} className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-mono text-2xl text-muted-foreground">{ext}</span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="truncate text-sm font-medium" title={upload.original_name}>{upload.original_name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(upload.file_size)} · {upload.views} views</p>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

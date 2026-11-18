import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Folder = { id: string; name: string; parentId: string | null; active: boolean; label: string };
export type Material = {
  id: string;
  title: string;
  description: string | null;
  kind: "file" | "link";
  url: string | null;
  fileName: string | null;
  size: number | null;
  folderId: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string;
};

// Skolens mapper (sorteret: mappe, dens undermapper, næste mappe …) med en visningstekst som "Taxa › Teori".
export async function loadFolders(schoolId: string): Promise<Folder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("material_folders")
    .select("id, name, parent_id, active, sort_order")
    .eq("school_id", schoolId)
    .order("sort_order")
    .order("name");
  const rows = data ?? [];
  const top = rows.filter((f) => !f.parent_id);
  return top.flatMap((t) => [
    { id: t.id, name: t.name, parentId: null, active: t.active, label: t.name },
    ...rows
      .filter((c) => c.parent_id === t.id)
      .map((c) => ({ id: c.id, name: c.name, parentId: t.id, active: c.active && t.active, label: `${t.name} › ${c.name}` })),
  ]);
}

// Materialer: i en mappe, privat ("mine") eller en søgning i skolens delte materialer. RLS sikrer, at man kun
// ser sine egne og skolens delte.
export async function loadMaterials(
  schoolId: string,
  userId: string,
  filter: { folderId?: string; mine?: boolean; q?: string },
): Promise<Material[]> {
  const supabase = await createClient();
  let query = supabase
    .from("materials")
    .select("id, title, description, kind, url, file_name, size_bytes, folder_id, owner_id, owner_name, created_at")
    .eq("school_id", schoolId)
    .eq("ready", true)
    .order("created_at", { ascending: false })
    .limit(300);
  if (filter.mine) query = query.is("folder_id", null).eq("owner_id", userId);
  else if (filter.folderId) query = query.eq("folder_id", filter.folderId);
  else query = query.not("folder_id", "is", null);
  if (filter.q) query = query.or(`title.ilike.%${filter.q.replace(/[%,()]/g, " ")}%,description.ilike.%${filter.q.replace(/[%,()]/g, " ")}%`);
  const { data } = await query;
  return (data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    kind: m.kind as Material["kind"],
    url: m.url,
    fileName: m.file_name,
    size: m.size_bytes,
    folderId: m.folder_id,
    ownerId: m.owner_id,
    ownerName: m.owner_name,
    createdAt: m.created_at,
  }));
}

// "2,4 MB"
export function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

import Link from "next/link";
import { ActionForm, TextField } from "@/components/form";
import { MaterialAddForm } from "@/components/material-add-form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { deleteFolder, deleteMaterial, moveMaterial, saveFolder } from "@/lib/material-actions";
import { formatSize, loadFolders, loadMaterials, type Folder, type Material } from "@/lib/materials";

const box = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]";
const tab = (on: boolean) => `flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-bold ${on ? "bg-accent text-ink" : "text-muted hover:text-ink"}`;

// Vidensbanken for lærere og kontor: skolens mapper (oprettet af admin) og egne, private materialer.
// Bruges både i kontoret og i lærer-appen; `base` er sidens adresse.
export async function MaterialsView({ base, params }: { base: string; params: Record<string, string | string[] | undefined> }) {
  const { user, membership } = await requireRole(["admin", "office", "instructor"]);
  const isAdmin = membership.role === "admin";
  const isStaff = isAdmin || membership.role === "office";
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const mine = one("vis") === "mine";
  const upload = one("vis") === "op";
  const folderId = one("mappe");
  const q = one("q").trim();

  const folders = await loadFolders(membership.schoolId);
  const open = folders.filter((f) => f.active);
  const folder = folders.find((f) => f.id === folderId);
  const materials = upload ? [] : await loadMaterials(membership.schoolId, user.id, mine ? { mine: true } : { folderId: folder?.id, q });
  const showList = !upload && (mine || folder || q);
  const school = !mine && !upload;
  const counts = new Map<string, number>();
  if (school && !folder && !q) {
    for (const m of await loadMaterials(membership.schoolId, user.id, {})) counts.set(m.folderId!, (counts.get(m.folderId!) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Materialer" className="flex rounded-[10px] border border-line2 bg-surface p-0.5">
        <Link href={base} aria-current={school ? "page" : undefined} className={tab(school)}>
          Skolens materialer
        </Link>
        <Link href={`${base}?vis=mine`} aria-current={mine ? "page" : undefined} className={tab(mine)}>
          Mine materialer
        </Link>
        <Link href={`${base}?vis=op`} aria-current={upload ? "page" : undefined} className={tab(upload)}>
          Læg materiale op
        </Link>
      </nav>

      {school && (
        <form action={base} role="search" className="flex gap-2">
          <input type="search" name="q" defaultValue={q} aria-label="Søg i materialer" placeholder="Søg i skolens materialer" className={inputClass} />
          <button type="submit" className="inline-flex h-11 items-center rounded-xl border border-line2 bg-surface px-4 text-[15px] font-bold">
            Søg
          </button>
        </form>
      )}

      {school && !q && !folder && (
        <section className={box} data-testid="material-folders">
          <h2 className="text-lg font-bold">Mapper</h2>
          {!open.length && (
            <p className="text-sm text-muted">{isAdmin ? "Der er ingen mapper endnu. Opret den første nedenfor." : "Admin har ikke oprettet nogen mapper endnu."}</p>
          )}
          <ul className="flex flex-col">
            {open.map((f) => (
              <li key={f.id} className={f.parentId ? "pl-5" : ""}>
                <Link
                  href={`${base}?mappe=${f.id}`}
                  className="flex items-center justify-between gap-2 border-b border-line py-2.5 text-[15px] last:border-b-0 hover:text-accent-ink"
                >
                  <b className={f.parentId ? "font-semibold" : ""}>
                    {f.parentId ? "↳ " : "📁 "}
                    {f.name}
                  </b>
                  <span className="text-sm text-muted">{counts.get(f.id) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showList && (
        <section className={box}>
          <div>
            {!mine && (
              <Link href={base} className="text-sm font-semibold text-accent-ink">
                ‹ Alle mapper
              </Link>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{mine ? "Mine materialer" : folder ? folder.label : `Søgning: "${q}"`}</h2>
              {(mine || folder?.active) && (
                <Link href={`${base}?vis=op${folder ? `&mappe=${folder.id}` : ""}`} className="text-sm font-semibold text-accent-ink hover:underline">
                  + Læg materiale op {folder ? "i denne mappe" : ""}
                </Link>
              )}
            </div>
          </div>
          {!materials.length && <p className="text-sm text-muted">{mine ? "Du har ingen private materialer." : "Her er intet endnu."}</p>}
          <ul className="flex flex-col" data-testid="material-list">
            {materials.map((m) => (
              <MaterialRow
                key={m.id}
                material={m}
                folders={open}
                canEdit={m.ownerId === user.id || (isStaff && !!m.folderId)}
                isOwner={m.ownerId === user.id}
                showFolder={!!q}
                folderName={folders.find((f) => f.id === m.folderId)?.label}
              />
            ))}
          </ul>
        </section>
      )}

      {upload && (
        <section className={box}>
          <h2 className="text-lg font-bold">Læg materiale op</h2>
          <MaterialAddForm folders={open.map((f) => ({ id: f.id, label: f.label }))} defaultFolderId={folder?.active ? folder.id : ""} />
        </section>
      )}

      {isAdmin && school && !folder && !q && <FolderAdmin folders={folders} />}
    </div>
  );
}

function MaterialRow({
  material: m,
  folders,
  canEdit,
  isOwner,
  showFolder,
  folderName,
}: {
  material: Material;
  folders: Folder[];
  canEdit: boolean;
  isOwner: boolean;
  showFolder: boolean;
  folderName?: string;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0" data-testid="material-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <b className="text-[15px]">
            {m.kind === "link" ? "🔗 " : "📄 "}
            {m.title}
          </b>
          {m.description && <span className="block text-sm">{m.description}</span>}
          <span className="block text-[13px] text-muted">
            {m.ownerName} · {formatDate(m.createdAt.slice(0, 10))}
            {m.kind === "file" && m.size != null && ` · ${formatSize(m.size)}`}
            {showFolder && folderName && ` · ${folderName}`}
          </span>
        </span>
        <span className="flex shrink-0 gap-2">
          <a href={`/api/materialer/${m.id}`} target="_blank" rel="noopener" className="rounded-xl border border-line2 px-3 py-1.5 text-sm font-semibold">
            Åbn
          </a>
          {m.kind === "file" && (
            <a href={`/api/materialer/${m.id}?hent`} className="rounded-xl border border-accent bg-accent px-3 py-1.5 text-sm font-bold text-ink">
              Hent
            </a>
          )}
        </span>
      </div>
      {canEdit && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-muted hover:text-ink">{m.folderId ? "Flyt eller slet" : "Del med skolen eller slet"}</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <ActionForm action={moveMaterial} submitLabel={m.folderId ? "Flyt" : "Del"} pendingLabel="…" primary={!m.folderId} className="flex items-end gap-2">
              <input type="hidden" name="id" value={m.id} />
              <label className="flex flex-col gap-1 text-[13px] font-bold">
                {m.folderId ? "Til mappe" : "Del i mappe"}
                <select name="folderId" required={!isOwner} defaultValue={m.folderId ?? ""} className={inputClass}>
                  {isOwner && <option value="">Mine materialer (kun mig)</option>}
                  {!isOwner && <option value="" disabled>Vælg mappe</option>}
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
            <ActionForm action={deleteMaterial} submitLabel="Slet" pendingLabel="…" primary={false} confirmText={`Slet "${m.title}"?`}>
              <input type="hidden" name="id" value={m.id} />
            </ActionForm>
          </div>
        </details>
      )}
    </li>
  );
}

// Kun admin: opret, omdøb, luk og slet mapper. En mappe med indhold kan kun lukkes.
function FolderAdmin({ folders }: { folders: Folder[] }) {
  const top = folders.filter((f) => !f.parentId);
  return (
    <section className={box} data-testid="folder-admin">
      <h2 className="text-lg font-bold">Mapper (admin)</h2>
      <ActionForm action={saveFolder} submitLabel="Opret mappe" className="flex flex-wrap items-end gap-3">
        <TextField label="Navn" name="name" required maxLength={60} placeholder="Fx Taxa" className="min-w-[180px] flex-1" />
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Placering
          <select name="parentId" defaultValue="" className={inputClass}>
            <option value="">Ny hovedmappe</option>
            {top.map((f) => (
              <option key={f.id} value={f.id}>
                Undermappe i {f.name}
              </option>
            ))}
          </select>
        </label>
      </ActionForm>
      {folders.length > 0 && (
        <ul className="flex flex-col gap-2">
          {folders.map((f) => (
            <li key={f.id} className={f.parentId ? "pl-5" : ""}>
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer text-[15px] font-semibold">
                  {f.label}
                  {!f.active && <span className="ml-2 text-sm font-normal text-muted">(lukket)</span>}
                </summary>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <ActionForm action={saveFolder} submitLabel="Gem" pendingLabel="…" className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="parentId" value={f.parentId ?? ""} />
                    <TextField label="Navn" name="name" required maxLength={60} defaultValue={f.name} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="active" defaultChecked={f.active} className="size-[18px] accent-accent" />
                      Åben
                    </label>
                  </ActionForm>
                  <ActionForm action={deleteFolder} submitLabel="Slet" pendingLabel="…" primary={false} confirmText={`Slet mappen "${f.name}"?`}>
                    <input type="hidden" name="id" value={f.id} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Lukkede mapper skjules for lærerne. En mappe med indhold kan kun lukkes, ikke slettes.</p>
    </section>
  );
}

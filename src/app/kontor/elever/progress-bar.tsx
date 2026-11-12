// Bjælke for hvor langt i forløbet (0–1).
export function ProgressBar({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-2 text-[13px] text-muted">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-soft">
        <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      {Math.round(share * 100)} %
    </span>
  );
}

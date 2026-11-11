// Ydelser i dropdown i skolens rækkefølge, med en streg mellem klyngerne.
export type ServiceOption = { id: string; name: string; breakAfter?: boolean };

export function ServiceOptions({ services }: { services: ServiceOption[] }) {
  return services.flatMap((s, i) => [
    <option key={s.id} value={s.id}>
      {s.name}
    </option>,
    ...(s.breakAfter && i < services.length - 1
      ? [
          <option key={`${s.id}-break`} disabled aria-hidden="true">
            ──────────
          </option>,
        ]
      : []),
  ]);
}

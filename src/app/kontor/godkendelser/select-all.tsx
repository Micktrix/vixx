"use client";

// Flueben, der vælger mange på én gang til "Godkend valgte": en hel dag (`day`) eller alle i tabellen.
// Fluebenene ved lektionerne hører til formularen `form` og har data-day med datoen.
export function SelectMany({ form, day, label, scope }: { form: string; day?: string; label: string; scope: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      className="mt-0.5 size-[18px] accent-accent"
      onChange={(e) => {
        const on = e.currentTarget.checked;
        const sel = `input[form="${form}"][data-scope="${scope}"]${day ? `[data-day="${day}"]` : ""}`;
        document.querySelectorAll<HTMLInputElement>(sel).forEach((c) => (c.checked = on));
      }}
    />
  );
}

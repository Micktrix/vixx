// Beløb gemmes i øre (heltal) og vises som "1.820 kr." eller "1.820,50 kr.".

export function formatKroner(ore: number): string {
  const hasOre = ore % 100 !== 0;
  return (
    new Intl.NumberFormat("da-DK", {
      minimumFractionDigits: hasOre ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(ore / 100) + " kr."
  );
}

// "270", "270,50", "1.820" eller "1820.5" → øre. Tom tekst → null. Ugyldigt → NaN.
export function parseKroner(input: string): number | null {
  const s = input.trim().replace(/\s|kr\.?/gi, "");
  if (!s) return null;
  // Dansk: punktum er tusindtalsskilletegn, komma er decimaltegn.
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
}

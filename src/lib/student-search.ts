// Søgning efter elever på navn eller telefonnummer. Alle ord i søgningen skal stå i navnet; cifre
// matches mod nummeret med og uden +45, så "20 45 67" og "+4520456" begge finder eleven.
export function matchesStudent(query: string, name: string, phone: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length === q.replace(/[\s+-]/g, "").length) {
    const own = phone.replace(/\D/g, "");
    return own.includes(digits) || own.replace(/^45/, "").includes(digits);
  }
  const words = name.toLowerCase();
  return q.split(/\s+/).every((w) => words.includes(w));
}

// Telefonnumre gemmes som E.164, fx "+4520456789". Otte cifre uden landekode tolkes som dansk.

export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, "");

  let digits: string;
  if (compact.startsWith("+")) digits = compact.slice(1);
  else if (compact.startsWith("00")) digits = compact.slice(2);
  else if (/^\d{8}$/.test(compact)) digits = `45${compact}`;
  else return null;

  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  if (digits.startsWith("45") && digits.length !== 10) return null;
  return `+${digits}`;
}

// "+4520456789" -> "+45 20 45 67 89". Andre lande vises uændret.
export function formatPhone(e164: string): string {
  const m = /^\+45(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+45 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

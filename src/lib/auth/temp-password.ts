import { randomInt } from "node:crypto";

// Uden tegn der let forveksles (0/O, 1/l/I), så koden kan læses op i telefonen.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

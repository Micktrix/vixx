// Underskriften gemmes som stregdata: "M x y L x y …" i et felt på 600 × 200. Kun tal, mellemrum, M og L
// er tilladt, så der aldrig kan ligge kode i den (samme regel som i databasen).
export const SIGNATURE_WIDTH = 600;
export const SIGNATURE_HEIGHT = 200;

export function isValidStrokes(strokes: string) {
  return strokes.length >= 10 && strokes.length <= 60000 && /^[ML0-9 .-]+$/.test(strokes) && strokes.includes("L");
}

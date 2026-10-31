// Antal kolonner og rækker, så n fliser fylder et felt uden at rulle.
// aspect = feltets bredde/højde; fliserne skal helst være ca. 2,2 gange så brede som høje.
export function tileGrid(n: number, aspect: number, tileAspect = 2.2): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  let best = { cols: 1, rows: n, score: Infinity };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    // Hvor tæt kommer flisens form på det ønskede, og hvor meget plads spildes?
    const shape = (aspect * rows) / cols; // flisens bredde/højde
    const score = Math.abs(Math.log(shape / tileAspect)) + (cols * rows - n) * 0.05;
    if (score < best.score) best = { cols, rows, score };
  }
  return { cols: best.cols, rows: best.rows };
}

// Prishistorik for en ydelse. Samme regel som public.service_price_on i databasen:
// prisen på en dato er den seneste med gyldig-fra på eller før datoen. Før første pris gælder den første.
export type PriceRow = { valid_from: string; amount_ore: number };

export function priceOn<T extends PriceRow>(prices: T[], date: string): T | null {
  let best: T | null = null;
  for (const p of prices) {
    if (p.valid_from <= date && (!best || p.valid_from > best.valid_from)) best = p;
  }
  return best ?? prices.reduce<T | null>((first, p) => (!first || p.valid_from < first.valid_from ? p : first), null);
}

// Den næste prisændring efter datoen, til "235 kr. fra 1. nov.".
export function nextPriceAfter<T extends PriceRow>(prices: T[], date: string): T | null {
  let best: T | null = null;
  for (const p of prices) {
    if (p.valid_from > date && (!best || p.valid_from < best.valid_from)) best = p;
  }
  return best;
}

// Svar fra public.service_usage: antal lektioner pr. ydelse.
export type ServiceUsage = { service_id: string; uses: number };

import { addDays, addMonths } from "./dates";

// Lønperioden løber fra skolens startdag (fx den 21.) til dagen før samme dag måneden efter.
export type PayPeriod = { start: string; end: string };

export function periodFor(date: string, startDay: number): PayPeriod {
  const day = Number(date.slice(8, 10));
  const thisMonth = `${date.slice(0, 8)}${String(startDay).padStart(2, "0")}`;
  const start = day >= startDay ? thisMonth : `${addMonths(date, -1).slice(0, 8)}${String(startDay).padStart(2, "0")}`;
  return { start, end: addDays(`${addMonths(start, 1).slice(0, 8)}${String(startDay).padStart(2, "0")}`, -1) };
}

export const nextPeriod = (p: PayPeriod, startDay: number) => periodFor(addDays(p.end, 1), startDay);
export const previousPeriod = (p: PayPeriod, startDay: number) => periodFor(addDays(p.start, -1), startDay);

export function daysIn(p: PayPeriod): string[] {
  const days: string[] = [];
  for (let d = p.start; d <= p.end; d = addDays(d, 1)) days.push(d);
  return days;
}

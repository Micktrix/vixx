import { describe, expect, it } from "vitest";
import { fitsLesson, resourceDetail, resourcesForLesson, type ResourceInfo } from "./resources";

const car: ResourceInfo = { id: "c", kind: "vehicle", name: "Personbil 1", categories: ["B", "BE"], lessonTypeIds: [], typeNames: [] };
const truck: ResourceInfo = { ...car, id: "t", name: "Lastbil", categories: ["C"] };
const room: ResourceInfo = { id: "r", kind: "room", name: "Lokale 1", categories: [], lessonTypeIds: ["teori"], typeNames: ["Teori"] };

describe("passer lokale/køretøj til lektionen", () => {
  it("en B-bil kan også bruges til BE", () => {
    expect(fitsLesson(car, { categories: ["BE"] })).toBe(true);
    expect(fitsLesson(truck, { categories: ["BE"] })).toBe(false);
  });
  it("en ydelse med flere kategorier passer, hvis bilen dækker én af dem", () => {
    expect(fitsLesson(truck, { categories: ["C", "CE"] })).toBe(true);
  });
  it("et teorilokale tilbydes kun til teori", () => {
    expect(fitsLesson(room, { categories: ["B"], lessonTypeId: "teori" })).toBe(true);
    expect(fitsLesson(room, { categories: ["B"], lessonTypeId: "korsel" })).toBe(false);
  });
  it("uden kategorier/typer passer det til alt, og uden valgt ydelse vises alt", () => {
    expect(fitsLesson({ ...car, categories: [] }, { categories: ["D"] })).toBe(true);
    expect(fitsLesson(truck, null)).toBe(true);
  });
  it("viser kategorier eller typer", () => {
    expect(resourceDetail(car)).toBe("B, BE");
    expect(resourceDetail(room)).toBe("Teori");
  });
});

describe("hvad tilbydes til lektionen", () => {
  const all = [car, truck, room];
  it("teori: lokaler, ikke biler", () => {
    expect(resourcesForLesson(all, { categories: ["B"], lessonTypeId: "teori" }).map((r) => r.id)).toEqual(["r"]);
  });
  it("kørsel: biler i kategorien, ikke lokaler", () => {
    expect(resourcesForLesson(all, { categories: ["B"], lessonTypeId: "korsel" }).map((r) => r.id)).toEqual(["c"]);
  });
  it("uden valgt ydelse: alt", () => {
    expect(resourcesForLesson(all, null)).toHaveLength(3);
  });
});

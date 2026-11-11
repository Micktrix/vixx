// Lokaler og køretøjer. Alle kan bookes til alle lektioner.

export type ResourceKind = "room" | "vehicle";

export type ResourceInfo = {
  id: string;
  kind: ResourceKind;
  name: string;
};

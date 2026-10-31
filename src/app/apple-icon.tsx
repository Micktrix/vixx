import { appIcon } from "./app-icon/icon-image";

// Ikon til iPhone, når appen lægges på hjemmeskærmen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}

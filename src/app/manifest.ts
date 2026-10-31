import type { MetadataRoute } from "next";

// Gør appen installérbar ("Føj til hjemmeskærm"). Lærere starter i lærer-appen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vixx Timeregistrering",
    short_name: "Vixx",
    description: "Planlægning og timeregistrering for køreskoler",
    lang: "da",
    start_url: "/laerer",
    scope: "/",
    display: "standalone",
    background_color: "#f5f4f2",
    theme_color: "#f5f4f2",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

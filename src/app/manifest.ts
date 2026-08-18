import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KDKMP Kedungharjo",
    short_name: "KDKMP",
    description: "Platform operasional Koperasi Desa Merah Putih Kedungharjo.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#0f1f30",
    orientation: "any",
    lang: "id-ID",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

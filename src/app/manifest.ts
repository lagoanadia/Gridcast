import type { MetadataRoute } from "next";
import { APP } from "@/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP.name,
    short_name: APP.name,
    description: APP.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#eadcc0",
    theme_color: "#4a1e10",
    categories: ["productivity", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Library", url: "/library", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calendar", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

export default function manifest() {
  return {
    name: "frets.dev",
    short_name: "frets.dev",
    description:
      "Open source fretboard training tools for guitar, bass, and similar instruments.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    background_color: "#05070d",
    theme_color: "#090c14",
    orientation: "landscape",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    categories: ["music", "education", "utilities"],
    lang: "en",
  };
}

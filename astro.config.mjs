// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "server",

  // npm sends DELETE requests without a content-type or origin header, which
  // Astro's global CSRF check rejects. The admin UI middleware does its own
  // origin check instead; the registry endpoints authenticate with tokens.
  security: {
    checkOrigin: false,
  },

  integrations: [vue()],

  devToolbar: {
    enabled: false,
  },

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare(),
});

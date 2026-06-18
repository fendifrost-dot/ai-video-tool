// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.

/** Replace heic2any with a tiny stub in SSR/Worker builds (Cloudflare forbids ssr.external). */
function heic2anySsrStub(): Plugin {
  const stubId = "\0heic2any-ssr-stub";
  return {
    name: "heic2any-ssr-stub",
    enforce: "pre",
    resolveId(source, _importer, options) {
      if (source === "heic2any" && options.ssr) return stubId;
    },
    load(id) {
      if (id === stubId) {
        return `export default async function heic2any() {
  throw new Error("heic2any is browser-only");
}`;
      }
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [heic2anySsrStub()],
  },
});

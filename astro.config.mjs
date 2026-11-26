import { defineConfig } from 'astro/config';

export default defineConfig({
  // one inline <style> instead of a CSS request: fewer round trips on slow networks
  build: { inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
  vite: { build: { chunkSizeWarningLimit: 700 } },
});

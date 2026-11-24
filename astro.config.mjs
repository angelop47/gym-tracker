// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // The app is served over plain HTTP under whatever IP or hostname the LAN gives it.
  // Without this, Astro ignores the Host header and its CSRF origin check rejects every form POST.
  security: {
    allowedDomains: [{ protocol: 'http' }],
  },
  integrations: [react()],

  adapter: node({
    mode: 'standalone'
  })
});

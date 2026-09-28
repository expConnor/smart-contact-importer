/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Same origin for the browser, so the backend's `lax` auth cookie just works.
    proxy: { '/v1': 'http://localhost:3000' },
  },
  test: {
    include: ['src/**/*.spec.ts'],
  },
});

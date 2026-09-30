/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
  plugins: [react()],
  // `@/…` resolves to `src/…`, as set in tsconfig.app.json.
  resolve: { tsconfigPaths: true },
  server: {
    // Same origin for the browser, so the backend's `lax` auth cookie just works.
    proxy: { '/v1': 'http://localhost:3000' },
    // The upload dialog offers the repo's fixtures/, which sits outside frontend/.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../fixtures'] },
  },
  test: {
    include: ['src/**/*.spec.ts'],
  },
});

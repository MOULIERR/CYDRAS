import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'supabase/functions/_shared/test/**/*.test.ts'], testTimeout: 60000, hookTimeout: 120000 } });

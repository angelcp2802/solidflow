import { configDefaults, defineConfig } from 'vitest/config';

// Public tests use versioned fixtures and work on a clean checkout.
// Local integration experiments are outside the public test suite.
export default defineConfig({
  test: {
    pool: 'forks',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [...configDefaults.exclude, 'src/cad/kernel.*-native.test.ts'],
  },
});

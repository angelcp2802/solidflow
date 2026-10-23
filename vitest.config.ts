import { configDefaults, defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';

// Public tests use versioned fixtures and work on a clean checkout.
// Local integration experiments are outside the public test suite.
export default defineConfig({
  test: {
    pool: 'forks',
    // Each isolated fork can own a large native/WASM heap. Keep the public
    // suite bounded on high-core desktops without changing any test deadline.
    maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [...configDefaults.exclude, 'src/cad/kernel.*-native.test.ts'],
  },
});

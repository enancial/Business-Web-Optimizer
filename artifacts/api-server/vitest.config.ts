import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Use forks for ESM + pino compatibility
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      // Test credentials — never used against real Stripe
      SESSION_SECRET: 'test-secret-for-automated-tests-only',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PINO_LOG_LEVEL: 'silent',
      OPTIMIZER_PRICE_ID: 'price_optimizer_test',
      OPTIMIZER_PRO_PRICE_ID: 'price_optimizer_pro_test',
      // Needed so routes/index doesn't throw on import
      PORT: '9999',
      // Fake DATABASE_URL so @workspace/db can be imported in tests without
      // throwing — no actual queries are made during the unit test suite.
      DATABASE_URL: 'postgresql://localhost/bwo_test',
      // Admin secret for any future admin route tests
      ADMIN_SECRET: 'test-admin-secret-only',
    },
    testTimeout: 15000,
  },
});

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  restoreMocks: true,
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/polyfills.cjs'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\.(css)$': 'identity-obj-proxy',
    // axios's default export under jsdom is an ES module; use its CommonJS build
    '^axios$': 'axios/dist/node/axios.cjs',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/**/*.d.ts'],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  reporters: process.env.CI
    ? ['default', ['jest-junit', { outputDirectory: 'reports', outputName: 'jest-junit.xml' }]]
    : ['default'],
};

import type { Config } from 'jest';

const config: Config = {
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        target: 'es2022',
      },
    }],
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testEnvironment: 'node',
  // Mock externals that are provided by Grafana at runtime
  moduleNameMapper: {
    '^@grafana/data$': '<rootDir>/src/__mocks__/@grafana/data.ts',
    '^@grafana/ui$': '<rootDir>/src/__mocks__/@grafana/ui.ts',
    '^dompurify$': '<rootDir>/src/__mocks__/dompurify.ts',
  },
};

export default config;

module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/tests/e2e.test.js'],
};
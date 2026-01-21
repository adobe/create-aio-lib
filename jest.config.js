module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.js'
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      lines: 100,
      statements: 100
    }
  },
  testMatch: [
    '**/test/**/*.test.js'
  ]
}

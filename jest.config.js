export default {
  testEnvironment: "node",
  testMatch: ["**/*.test.js"],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 10000,
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/index.test.js",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/database/",
    "/config/",
    "/routes/config/",
    "/routes/schemas/",
    "/routes/middleware/",
  ],
};
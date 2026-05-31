// Test mock for @neondatabase/serverless. Tests run in in-memory mode
// (no DATABASE_URL), so the neon client is imported but never invoked.
module.exports = {
  neon: () => () => Promise.resolve([]),
};

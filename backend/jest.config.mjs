// Moved out of package.json's "jest" key: the two projects differ in ways that
// need explaining, and JSON cannot carry a comment.

/**
 * Everything both layers share. Kept identical on purpose — a unit test and an
 * e2e test must resolve and compile a module the same way, or a helper that
 * passes in one layer fails in the other for reasons that have nothing to do
 * with the code under test.
 */
const shared = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // NodeNext emits `./x.js` specifiers from `./x.ts` sources; strip the
  // extension so Jest resolves them against the TypeScript files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};

export default {
  projects: [
    {
      ...shared,
      displayName: 'unit',
      // Every *.spec.ts EXCEPT *.e2e.spec.ts. The negative lookbehind is what
      // keeps the two projects from both claiming a file: there is exactly one
      // position where `.spec.ts$` can match, and for an e2e file the four
      // characters before it are `.e2e`.
      testRegex: '.*(?<!\\.e2e)\\.spec\\.ts$',
    },
    {
      ...shared,
      displayName: 'e2e',
      testRegex: '.*\\.e2e\\.spec\\.ts$',
      // Note: `test:e2e` passes node --experimental-vm-modules. Prisma 7's
      // client reaches for a dynamic import at query time, which Jest's CJS VM
      // context refuses without it. Unit tests never open a connection, so
      // `test:unit` runs the plain binary.
      // Refuses a non-_test DATABASE_URL, then applies migrations. Runs in the
      // Jest parent process, which is where --env-file put the test URL.
      globalSetup: '<rootDir>/test/global-setup.ts',
      // Per-file, inside the worker: registers the TRUNCATE. Not optional and
      // not per-spec — see the comment in that file.
      setupFilesAfterEnv: ['<rootDir>/test/setup-e2e.ts'],
      // D6's --runInBand is NOT set here: Jest has no per-project maxWorkers,
      // so the npm script is the only enforcement point. Failing closed covers
      // the gap — a bare `npx jest` has no DATABASE_URL and globalSetup throws.
    },
  ],

  // Coverage is configured once, at the top level; a `projects` run merges it.
  // Not a gate — SPEC lists coverage percentage as "not assessed".
  collectCoverageFrom: ['**/*.(t|j)s', '!generated/**'],
  coverageDirectory: '../coverage',
};

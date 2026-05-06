/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/__tests__'],
    testMatch: ['**/*.test.{js,ts}'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            diagnostics: false,
            tsconfig: 'tsconfig.jest.json'
        }]
    },
    transformIgnorePatterns: [
        '/node_modules/',
        '^.+\\.jsx?$'
    ],
    moduleFileExtensions: ['js', 'ts', 'json'],
    testPathIgnorePatterns: ['/node_modules/', '/.claude/']
};

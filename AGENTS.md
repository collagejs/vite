# Vite Plugins Monorepo

This is a monorepo containing TypeScript Vite plugins with shared configuration and build tooling.

## Project Structure
- `packages/` - Contains individual Vite plugin packages
- Each plugin has its own package.json and TypeScript configuration
- Shared dependencies and tooling managed at the root level

## Development Guidelines
- Use npm workspaces for dependency management
- Follow TypeScript best practices
- Each plugin should export proper Vite plugin interface
- Use consistent build and test scripts across packages
- One special package:  `@collagejs/shared` under `/packages/shared` and is used as source for shared code logic for both unit testing and core plug-in functionality
- `@collagejs/shared` is never published, so it is expected that its functionality be bundled in the other packages

## Agent Guidelines for Unit Testing

This section captures the unit testing patterns and standards established for all packages in this monorepo.

### Testing Framework Stack

Vitest.

### Project Structure

#### Test Organization
- **Mirror source structure**: `/tests` folder structure must exactly match `/src` folder structure
- **File naming**: Use `.test.ts` extension (e.g., `Resolver.test.ts` for testing `Resolver.ts`)
- **Import paths**: Use relative imports from source files

```
src/
  index.ts
  validate.ts
  Resolver.ts
  types.ts
  _shared/
    banner.ts
    logging.ts
tests/
  index.test.ts
  validate.test.ts  
  Resolver.test.ts
  types.test.ts
  _shared/
    banner.test.ts
    logging.test.ts
```

### Test Structure Patterns

#### Basic Test File Template
```typescript
import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import sinon from 'sinon';
import { YourClass } from '../src/YourClass.js';

describe('YourClass', () => {
    let instance: YourClass;

    beforeEach(() => {
        instance = new YourClass();
    });

    describe('methodName', () => {
        it('Should perform expected behavior for specific input.', () => {
            expect(instance.methodName('input')).to.equal('expected');
        });
    });
});
```

#### Test Case Organization
- **One test case per `it()` block**: Never test multiple scenarios in one test
- **Use `describe()` blocks**: Group related functionality logically
- **Use `beforeEach()`**: Set up clean state for each test
- **Use `forEach()` for data-driven tests**: When testing multiple inputs with same logic

#### GitHub Issue Tracking
- `import { td } from "@collagejs/shared";`:  Wrap all test descriptions with the `td()` function
- Prefer test cases in arrays and then using `Array.forEach()` over Vitest's `test.each()`
- The `td()` function accepts test cases with an `issueId` optional property or the ID directly
- The use of `td()` is preemptive:  Its presence allows easy addition of issue identifiers

#### Data-Driven Test Pattern
```typescript
const testCases = [
    { input: 'react', expected: 'https://esm.sh/react@18' },
    { input: 'lodash', expected: 'https://cdn.skypack.dev/lodash' },
    { input: 'utils', expected: '/lib/utils.js' }
];

testCases.forEach(({ input, expected }) => {
    it(`Should resolve exact match: "${input}" → "${expected}".`, () => {
        expect(resolver.resolve(input)).to.equal(expected);
    });
});
```

- Avoid the need for the `testCases` variable when possible and instead to `[].forEach(...)` directly to avoid variable pollution

### Test Description Standards

#### Grammar Rules
- **Start with capital letter**: "Should resolve..."
- **End with period**: "...expected result."
- **Use complete sentences**: Avoid phrases, use full grammatical sentences
- **Include specific test data**: Show actual inputs/outputs in description

#### Good Examples
```typescript
✅ it('Should resolve exact match: "react" → "https://esm.sh/react@18".', () => {
✅ it('Should return undefined for unresolved bare specifier "unknown-package".', () => {
✅ it('Should throw an error when resolving with invalid import map.', () => {
```

#### Bad Examples
```typescript
❌ it('resolves exact matches', () => {  // No capital, no period, no specifics
❌ it('should resolve "react" and "lodash"', () => {  // Multiple test cases in one
❌ it('Should resolve exact matches: "react" → "https://esm.sh/react@18", "lodash" → "https://cdn.skypack.dev/lodash".', () => {  // Multiple cases
```

### Testing Best Practices

#### What TO Test
- **Public APIs**: All public methods and properties
- **Edge cases**: Empty inputs, invalid data, boundary conditions
- **Error conditions**: Invalid inputs should throw appropriate errors
- **Integration scenarios**: How components work together
- **Spec compliance**: Behavior matches documented specifications

#### What NOT to Test
- **Private implementation details**: Don't test private methods or fields directly
- **Specific error messages**: Use `.to.throw()` instead of `.to.throw('specific message')`
- **Internal data structures**: Don't verify private data was created correctly

#### Error Testing Pattern
```typescript
// ✅ Good - Generic error checking
it('Should throw an error when resolving with invalid import map.', () => {
    expect(() => invalidResolver.resolve('test')).to.throw();
});

// ❌ Bad - Specific error message testing
it('Should throw "Cannot resolve using an invalid import map".', () => {
    expect(() => invalidResolver.resolve('test')).to.throw('Cannot resolve using an invalid import map');
});
```

#### Mocking with Sinon
```typescript
// Stub external dependencies
const stub = sinon.stub(externalModule, 'methodName').returns('mocked value');

// Spy on method calls
const spy = sinon.spy(instance, 'methodName');
expect(spy.calledWith('expected-arg')).to.be.true;

// Restore in afterEach
afterEach(() => {
    sinon.restore();
});
```

### TypeScript Configuration

#### Test-specific tsconfig.json considerations
- Include test files in compilation
- Enable ES modules for Node.js compatibility
- Ensure proper type checking for test files

### Coverage Expectations

#### Comprehensive Test Scenarios
- **Happy path**: Normal expected usage
- **Edge cases**: Boundary conditions, empty/null/undefined inputs
- **Error cases**: Invalid inputs, malformed data
- **Integration**: How components work with real dependencies
- **Spec compliance**: Implementation matches documented behavior

#### Example Test Categories
```typescript
describe('YourClass', () => {
    describe('constructor', () => {
        // Test object creation, validation, initialization
    });

    describe('publicMethod - basic functionality', () => {
        // Test normal usage scenarios
    });

    describe('publicMethod - edge cases', () => {
        // Test boundary conditions, empty inputs, etc.
    });

    describe('publicMethod - error handling', () => {
        // Test invalid inputs, error throwing
    });

    describe('properties', () => {
        // Test public property access and behavior
    });
});
```

### Quality Gates

#### All tests must pass
- Zero failing tests before committing
- Fix implementation bugs revealed by tests
- Don't modify tests to pass broken implementation

#### Test descriptions must be clear
- Anyone reading the test should understand what it verifies
- Include concrete examples in descriptions
- Use proper grammar and punctuation

#### One assertion per test
- Each test should verify one specific behavior
- Use data-driven patterns for multiple similar inputs
- Split complex scenarios into multiple tests

---

*This document should be updated as testing patterns evolve and new best practices are established.*
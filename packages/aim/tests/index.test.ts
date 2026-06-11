import { describe, test, expect } from "vitest";

describe("index", () => {
    test("Should export exactly what's expected.", async () => {
        const expectedExports = [
            'cjsAimPlugin'
        ];
        const module = await import('../src/index.js');
        const moduleProps = Object.getOwnPropertyNames(module);
        for (let x of moduleProps) {
            expect(expectedExports.includes(x)).toBe(true);
        }
        for (let x of expectedExports) {
            expect(moduleProps.includes(x)).toBe(true);
        }
    });
});

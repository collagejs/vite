import { describe, test, expect } from "vitest";

describe("index", () => { 
    test("should export the exact list of expected objects.", async () => {
        const expectedExports = [
            "cjsCssPlugin",
        ];
        const actualExports = Object.keys(await import("../src/index.js"));
        expect(actualExports).toEqual(expect.arrayContaining(expectedExports));
        expect(expectedExports).toEqual(expect.arrayContaining(actualExports));
    });
});
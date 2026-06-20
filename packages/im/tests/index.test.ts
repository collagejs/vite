import { describe, it, expect } from "vitest";

describe("index", () => {
    it("Should only export the expected objects.", async () => {
        const expectedExports = [
            "cjsImPlugin"
        ];
        const module = await import("../src/index.js");
        const actualExports = Object.keys(module);
        expect(actualExports).to.have.members(expectedExports);
        for (let key of Object.keys(module)) {
            expect(expectedExports).to.include(key);
        }
    });
});
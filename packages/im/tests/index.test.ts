import { expect } from "chai";
import { describe, it } from "mocha";

describe("index", () => {
    it("Should only export the expected objects.", async () => {
        const expectedExports = [
            "collageJsImPlugin"
        ];
        const module = await import("../src/index.js");
        const actualExports = Object.keys(module);
        expect(actualExports).to.have.members(expectedExports);
        for (let key of Object.keys(module)) {
            expect(expectedExports).to.include(key);
        }
    });
});
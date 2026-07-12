import { describe, test, expect, vi } from "vitest";
import * as indexEx from "../src/index-ex.js";

vi.mock(import('../src/injected-map.js'), () => {
    return Promise.resolve({
        cssInjectedMap: '{}',
    })
});

describe("index", () => { 
    test("should export the exact list of expected objects.", async () => {
        const expectedExports = [
            'CssFactory',
            'configureLogger',
            'viteEnv',
        ];
        const actualExports = Object.keys(indexEx);
        expect(actualExports).toEqual(expect.arrayContaining(expectedExports));
        expect(expectedExports).toEqual(expect.arrayContaining(actualExports));
    });
});
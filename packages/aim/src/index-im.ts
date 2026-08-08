import type { ImportMap } from "@collagejs/importmap";

/**
 * Returns a copy of the import map that `@collagejs/vite-aim` currently holds.
 * 
 * - If Vite is running in `'serve'` mode, this will return the import map received from `@collagejs/imo`.
 * - If Vite is running in `'build'` mode, this will return the import map the plug-in received via options.
 */
export declare const importMap: ImportMap;

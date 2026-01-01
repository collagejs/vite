export type * from "./types.js"
import { pluginFactory } from "./plugin-factory.js"
/**
 * Vite plug-in that injects import maps into the project's HTML root file.  Can also add the `import-map-overrides` 
 * user interface to allow for dynamic overriding of import map entries at runtime.  Useful for debugging and working 
 * on application maintenance (developers only need to run the micro-frontend they are working on).
 * @param options Configuration options for the plug-in.
 * @returns A configured Vite plug-in instance.
 */
export const collageJsImPlugin = pluginFactory();

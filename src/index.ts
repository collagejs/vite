import { pluginFactory } from "./plugin-factory.js";

/**
 * Vite plug-in that injects a dynamically-generated module that mounts and unmounts CSS files bundled by Vite in 
 * synchrony with the CollageJS pieces that depend on them.
 * @param options Configuration options for the plug-in.
 * @returns A configured Vite plug-in instance.
 */
export const collageJsCssPlugin = pluginFactory();

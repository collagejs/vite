export type * from "./types.js";
import { cjsAimPlugin as factoryFn } from "./plugin-factory.js";

/*
Workaround for bug in @microsoft/api-extractor.

See https://github.com/microsoft/rushstack/issues/3875

If the issue is ever corrected, go back to just:
export { cjsAimPlugin } from "./plugin-factory.js";
*/
import type { Plugin } from "vite";
import type { CollageJsAimPluginOptions } from "./types.js";

type PluginFactory = (options?: CollageJsAimPluginOptions) => Plugin;
const temp = factoryFn as PluginFactory;
export { temp as cjsAimPlugin };
/*
END Workaround for bug in @microsoft/api-extractor.
*/

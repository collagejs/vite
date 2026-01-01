import { promises as fs, existsSync } from 'fs';
import type { HtmlTagDescriptor, Plugin, ConfigEnv } from 'vite';
import type { CollageJsImPluginOptions, ImportMap, ImoUiOption } from './types.js';

/**
 * Factory function that produces the `@collagejs/vite-im` plugin factory.  Yes, a factory of factories.
 * 
 * This indirection exists to allow for unit testing.
 * @param readFileFn Function used to read files.
 * @param fileExistsFn Function used to determine if a particular file name represents an existing file.
 * @returns The plug-in factory function.
 */
export function pluginFactory(
    readFileFn?: typeof fs.readFile,
    fileExistsFn?: typeof existsSync
): (options?: CollageJsImPluginOptions) => Plugin {
    const readFile = readFileFn ?? fs.readFile;
    const fileExists = fileExistsFn ?? existsSync;
    return (options?: CollageJsImPluginOptions) => {
        /**
         * Set in config() and is used to preserve Vite command information.
         */
        let viteEnv: ConfigEnv;

        /**
         * Loads the import map files (JSON files) that are pertinent to the occasion.
         * @param command Vite command (serve or build).
         * @returns An array of string values, where each value is the content of one import map file.
         */
        async function loadImportMaps(command: ConfigEnv['command']) {
            let fileCfg = command === 'serve' ? options?.importMaps?.dev : options?.importMaps?.build;
            const defaultFile = fileExists('src/importMap.dev.json') ? 'src/importMap.dev.json' : 'src/importMap.json';
            if (fileCfg === undefined || typeof fileCfg === 'string') {
                const mapFile = command === 'serve' ?
                    (fileCfg ?? defaultFile) :
                    (fileCfg ?? 'src/importMap.json');
                if (!fileExists(mapFile)) {
                    return null;
                }
                const contents = await readFile(mapFile, {
                    encoding: 'utf8'
                }) as string;
                return [contents];
            }
            else {
                const fileContents: string[] = [];
                for (let f of fileCfg) {
                    const contents = await readFile(f, { encoding: 'utf8' }) as string;
                    fileContents.push(contents);
                }
                return fileContents;
            }
        }

        /**
         * Builds and returns the final import map using as input the provided input maps.
         * @param maps Array of import maps that are merged together as a single map.
         */
        function buildImportMap(maps: Required<ImportMap>[]) {
            const importMap: Required<ImportMap> = { imports: {}, scopes: {} };
            for (let map of maps) {
                for (let key of Object.keys(map.imports)) {
                    importMap.imports[key] = map.imports[key]!;
                }
                if (map.scopes) {
                    for (let key of Object.keys(map.scopes)) {
                        importMap.scopes[key] = {
                            ...importMap.scopes[key],
                            ...map.scopes[key]
                        }
                    }
                }
            }
            return importMap;
        }

        /**
         * Transforms the HTML file of projects by injecting import maps and the import-map-overrides script.
         * @param html HTML file content in string format.
         * @returns An `IndexHtmlTransformResult` object that includes the injected import map and the 
         * import-map-overrides body markup.
         */
        async function rootIndexTransform(html: string) {
            const importMapContents = await loadImportMaps(viteEnv.command);
            let importMap: Required<ImportMap> | undefined = undefined;
            if (importMapContents) {
                importMap = buildImportMap(importMapContents.map(t => JSON.parse(t)));
            }
            const tags: HtmlTagDescriptor[] = [];
            if (importMap) {
                tags.push({
                    tag: 'script',
                    attrs: {
                        type: options?.importMaps?.type ?? 'overridable-importmap',
                    },
                    children: JSON.stringify(importMap, null, 2),
                    injectTo: 'head-prepend',
                });
            }
            if (options?.imo !== false && importMap) {
                let imoVersion = 'latest';
                if (typeof options?.imo === 'string') {
                    imoVersion = options.imo;
                }
                const imoUrl = typeof options?.imo === 'function' ?
                    options.imo() :
                    `https://cdn.jsdelivr.net/npm/import-map-overrides@${imoVersion}/dist/import-map-overrides.js`;
                tags.push({
                    tag: 'script',
                    attrs: {
                        type: 'text/javascript',
                        src: imoUrl
                    },
                    injectTo: 'head-prepend'
                });
            }
            let imoUiCfg: ImoUiOption = {
                buttonPos: 'bottom-right',
                localStorageKey: 'imo-ui',
                variant: 'full'
            };
            if (typeof options?.imoUi === 'object') {
                imoUiCfg = {
                    ...imoUiCfg,
                    ...options.imoUi
                };
            }
            else if (options?.imoUi !== undefined) {
                imoUiCfg.variant = options.imoUi;
            }
            if (imoUiCfg.variant && importMap) {
                imoUiCfg.variant = imoUiCfg.variant === true ? 'full' : imoUiCfg.variant;
                let attrs: Record<string, string | boolean | undefined> | undefined = undefined;
                if (imoUiCfg.variant === 'full') {
                    attrs = {
                        'trigger-position': imoUiCfg.buttonPos,
                    };
                    if (imoUiCfg.localStorageKey !== true) {
                        attrs['show-when-local-storage'] = imoUiCfg.localStorageKey
                    }
                }
                tags.push({
                    tag: `import-map-overrides-${imoUiCfg.variant}`,
                    attrs: attrs ?? {},
                    injectTo: 'body'
                });
            }
            return {
                html,
                tags
            };
        }

        return {
            name: '@collagejs/vite-im',
            async config(_cfg, opts) {
                viteEnv = opts;
                return {};
            },
            transformIndexHtml: {
                order: 'post',
                handler(html: string) {
                    return rootIndexTransform(html)
                },
            },
        };
    };
};

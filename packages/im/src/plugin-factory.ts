import { promises as fs, existsSync } from 'fs';
import type { HtmlTagDescriptor, ConfigEnv, Plugin } from 'vite';
import type { CollageJsImPluginOptions, ImportMapsOption } from './types.js';
import type { ImportMap } from "@collagejs/importmap";
import { cjsAimPlugin, PluginOptions } from '@collagejs/vite-aim';
import wjConfig from 'wj-config';
import { imoUiOptionsId, imPostingOptionsId } from '@collagejs/imo/const';

export const defaultDevImportMap = 'src/importMap.dev.json';
export const defaultBuildImportMap = 'src/importMap.json';

/**
 * Default plug-in options.  The `imoUi` properties are not set so the default ones set by the `@collagejs/imo` package 
 * enter in effect.
 * 
 * NOTE:  Only exported for unit testing purposes.
 */
export const defaultOptions = {
    aim: true,
    imo: true,
    importMaps: {} as ImportMapsOption,
};

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
): (options?: CollageJsImPluginOptions | PluginOptions, aimOptions?: PluginOptions) => Promise<[Plugin, Plugin | null]> {
    const readFile = readFileFn ?? fs.readFile;
    const fileExists = fileExistsFn ?? existsSync;
    return async (options?: CollageJsImPluginOptions | PluginOptions, aimOptions?: PluginOptions) => {
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
            let fileCfg = command === 'serve' ? imOpt.importMaps?.dev : imOpt.importMaps?.build;
            const defaultFile = fileExists(defaultDevImportMap) ? defaultDevImportMap : defaultBuildImportMap;
            if (fileCfg === undefined || typeof fileCfg === 'string') {
                const mapFile = command === 'serve' ?
                    (fileCfg ?? defaultFile) :
                    (fileCfg ?? defaultBuildImportMap);
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
                    if (!fileExists(f)) {
                        continue;
                    }
                    const contents = await readFile(f, { encoding: 'utf8' }) as string;
                    fileContents.push(contents);
                }
                return fileContents.length > 0 ? fileContents : null;
            }
        }

        /**
         * Builds and returns the final import map using as input the provided input maps.
         * @param maps Array of import maps that are merged together as a single map.
         */
        function buildImportMap(maps: ImportMap[]) {
            const importMap: Required<ImportMap> = { imports: {}, scopes: {}, integrity: {} };
            for (let map of maps) {
                if (map.imports) {
                    for (let key of Object.keys(map.imports)) {
                        importMap.imports[key] = map.imports[key];
                    }
                }
                if (map.scopes) {
                    for (let key of Object.keys(map.scopes)) {
                        importMap.scopes[key] = {
                            ...importMap.scopes[key],
                            ...map.scopes[key]
                        }
                    }
                }
                if (map.integrity) {
                    for (let key of Object.keys(map.integrity)) {
                        importMap.integrity[key] = map.integrity[key];
                    }
                }
            }
            return importMap;
        }

        /**
         * Transforms the HTML file of projects by injecting import maps and the @collagejs/imo script and UI.
         * @param html HTML file content in string format.
         * @returns An `IndexHtmlTransformResult` object that includes the injected import map and the 
         * @collagejs/imo body markup.
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
                        type: 'overridable-importmap',
                    },
                    children: JSON.stringify(importMap, null, 2),
                    injectTo: 'head-prepend',
                });
            }
            if (imOpt.imo !== false && importMap) {
                let imoVersion = 'latest';
                const imoSource = typeof imOpt.imo === 'object' ?
                    imOpt.imo.source :
                    imOpt.imo;
                if (typeof imoSource === 'string') {
                    imoVersion = imoSource;
                }
                const imoUrl = typeof imoSource === 'function' ?
                    imoSource() :
                    `https://cdn.jsdelivr.net/npm/@collagejs/imo@${imoVersion}/dist/imo.min.js`;
                tags.push({
                    tag: 'script',
                    attrs: {
                        type: 'text/javascript',
                        src: imoUrl
                    },
                    injectTo: 'head-prepend'
                });
                if (typeof imOpt.imo === 'object' && imOpt.imo.options) {
                    tags.push({
                        tag: 'script',
                        attrs: {
                            type: 'application/json',
                            id: imPostingOptionsId
                        },
                        children: JSON.stringify(imOpt.imo.options),
                        injectTo: 'head-prepend'
                    });
                }
                if (imOpt.imoUi && importMap) {
                    if (typeof imOpt.imoUi === 'object') {
                        tags.push({
                            tag: `script`,
                            attrs: {
                                type: 'application/json',
                                id: imoUiOptionsId
                            },
                            children: JSON.stringify(imOpt.imoUi),
                            injectTo: 'head'
                        });
                    }
                    tags.push({
                        tag: 'script',
                        attrs: {
                            type: 'module',
                            src: imoUrl.substring(0, imoUrl.lastIndexOf('/') + 1) + 'imo-ui.js',
                        },
                        injectTo: 'body'
                    });
                }
            }
            return {
                html,
                tags
            };
        }

        function isImOptions(opt: CollageJsImPluginOptions | PluginOptions | undefined): opt is CollageJsImPluginOptions {
            if (!opt) {
                return false;
            }
            return Object.hasOwn(opt, 'importMaps') ||
                Object.hasOwn(opt, 'imo') ||
                Object.hasOwn(opt, 'imoUi') ||
                Object.hasOwn(opt, 'aim')
                ;
        }

        const imOpt = await wjConfig()
            .addObject(defaultOptions)
            .addObject(() => Promise.resolve(options as CollageJsImPluginOptions))
            .when(() => isImOptions(options))
            .postMerge(cfg => {
                if (cfg.imoUi === undefined) {
                    cfg.imoUi = true;
                }
                return cfg;
            })
            .build();
        const aimOpt = await wjConfig()
            .addObject({
                pathExceptions: ['/', 'index.html']
            })
            .addObject(() => Promise.resolve(aimOptions!))
            .when(() => !!aimOptions && !isImOptions(options))
            .addObject(() => Promise.resolve(options as PluginOptions))
            .when(() => !isImOptions(options) && !!options)
            .build();
        return [{
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
        }, imOpt?.aim === false ? null : cjsAimPlugin(aimOpt)];
    };
};

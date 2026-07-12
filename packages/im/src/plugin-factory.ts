import { promises as fs, existsSync } from 'fs';
import type { HtmlTagDescriptor, ConfigEnv, Plugin } from 'vite';
import type { CollageJsImPluginOptions, Xor } from './types.js';
import type { ImportMap } from "@collagejs/importmap";
import { cjsAimPlugin, type CollageJsAimPluginOptions } from '@collagejs/vite-aim';
import wjConfig from 'wj-config';
import { imoUiOptionsId, imPostingOptionsId } from '@collagejs/imo/const';
import type { ImoUiFactoryOptions } from '@collagejs/imo';

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
): (options?: Xor<CollageJsImPluginOptions, CollageJsAimPluginOptions>, aimOptions?: CollageJsAimPluginOptions) => Promise<[Plugin, Plugin | null]> {
    const readFile = readFileFn ?? fs.readFile;
    const fileExists = fileExistsFn ?? existsSync;
    return async (options?: Xor<CollageJsImPluginOptions, CollageJsAimPluginOptions>, aimOptions?: CollageJsAimPluginOptions) => {
        /**
         * Set in config() and is used to preserve Vite command information.
         */
        let viteEnv: ConfigEnv;

        /**
         * Calculates the import map files that are pertinent to the occasion.  The calculation is based on the Vite 
         * command and the `importMaps` property of the plug-in options.
         * @param command Vite command.
         * @returns An array of file names and a Boolean value that tells whether the file exists.
         */
        function getImportMapFiles(command: ConfigEnv['command']) {
            let fileCfg = typeof imOpt.importMaps === 'string' || Array.isArray(imOpt.importMaps) ?
                imOpt.importMaps : command === 'serve' ?
                    imOpt.importMaps?.dev : imOpt.importMaps?.build;
            const devDefaultFile = fileExists(defaultDevImportMap) ? defaultDevImportMap : defaultBuildImportMap;
            if (fileCfg === undefined || typeof fileCfg === 'string') {
                const mapFile = command === 'serve' ?
                    (fileCfg ?? devDefaultFile) :
                    (fileCfg ?? defaultBuildImportMap);
                return [{
                    file: mapFile,
                    exists: fileExists(mapFile)
                }];
            }
            return fileCfg.map(f => ({
                file: f,
                exists: fileExists(f)
            }));
        }

        /**
         * Loads the import map files (JSON files) that are pertinent to the occasion.
         * @param command Vite command (serve or build).
         * @returns An array of string values, where each value is the content of one import map file.
         */
        async function loadImportMaps(command: ConfigEnv['command']) {
            const files = getImportMapFiles(command);
            const contents = [] as string[];
            for (let f of files) {
                if (!f.exists) {
                    continue;
                }
                const content = await readFile(f.file, { encoding: 'utf8' });
                contents.push(content);
            }
            return contents.length > 0 ? contents : null;
        }

        /**
         * Merges multiple import maps into a single import map.  The merging is done by merging the `imports`, 
         * `scopes` and `integrity` properties of the maps.  In case of conflicts, the last map in the array wins.
         * @param maps Array of import maps that are merged together as a single map.
         * @returns A single import map that results from merging the input maps.
         */
        function mergeImportMaps(maps: ImportMap[]) {
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
         * Builds the import map by loading the pertinent import map files and merging them together.  If no import map
         * files are found, `undefined` is returned.
         * @param command Vite command (serve or build) that is used to determine which import map files are pertinent.
         * @returns The final import map.
         */
        async function buildImportMap(command?: ConfigEnv['command']) {
            const importMapContents = await loadImportMaps(command ?? viteEnv.command);
            if (importMapContents) {
                return mergeImportMaps(importMapContents.map(t => JSON.parse(t)));
            }
            return undefined;
        }

        /**
         * Transforms the HTML file of projects by injecting import maps and the @collagejs/imo script and UI.
         * @param html HTML file content in string format.
         * @returns An `IndexHtmlTransformResult` object that includes the injected import map and the 
         * @collagejs/imo body markup.
         */
        async function rootIndexTransform(html: string) {
            let importMap: Required<ImportMap> | undefined = await buildImportMap();
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
                    const uiOptions: ImoUiFactoryOptions = typeof imOpt.imoUi === 'object' ?
                        imOpt.imoUi :
                        {};
                    tags.push({
                        tag: `script`,
                        attrs: {
                            type: 'application/json',
                            id: imoUiOptionsId
                        },
                        children: JSON.stringify(uiOptions),
                        injectTo: 'head'
                    });
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

        function isImOptions(opt: CollageJsImPluginOptions | CollageJsAimPluginOptions | undefined): opt is CollageJsImPluginOptions {
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
        let aimOpt: CollageJsAimPluginOptions | undefined;
        if (imOpt.aim !== false) {
            aimOpt = await wjConfig()
                .addObject({
                    pathExceptions: ['/', '/index.html']
                })
                .addObject(() => Promise.resolve(aimOptions!))
                .when(() => !!aimOptions && !isImOptions(options))
                .addObject(() => Promise.resolve(options as CollageJsAimPluginOptions))
                .when(() => !isImOptions(options) && !!options)
                .postMerge(async (cfg) => {
                    if (cfg.importMap) {
                        return cfg;
                    }
                    const im = await buildImportMap('build');
                    if (im) {
                        cfg.importMap = im;
                    }
                    if (!imOpt.imo || !getImportMapFiles('serve').some(f => f.exists)) {
                        cfg.shouldBlock = () => {
                            // Since there will be no IMO script or no import map,
                            // blocking requests is pointless.
                            return false;
                        }
                    }
                    return cfg;
                })
                .build();
        }
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

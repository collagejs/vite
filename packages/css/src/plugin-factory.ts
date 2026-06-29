import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { CollageJsCssPluginOptions } from './types.js';
import { closeLog, formatData, markdownCodeBlock, openLog, writeToLog } from './debug.js';
import type { Plugin, ConfigEnv, UserConfig } from 'vite';
import type { InputOption, InputOptions, RenderedChunk } from 'rolldown';
import { allModuleNames, extensionModuleName } from './ex-defs.js';
import { cjsAimPlugin, type PluginOptions } from '@collagejs/vite-aim';
import wjConfig from 'wj-config';
import { CssMap } from './private-types.js';

const defaultOptions = {
    localhostSsl: false,
    entryPoints: 'src/piece.ts',
    aim: true,
};

/**
 * Factory function that produces the `@collagejs/vite-css` plugin factory.  Yes, a factory of factories.
 * 
 * This indirection exists to allow for unit testing.
 * @param readFileFn Function used to read files.
 * @returns The plug-in factory function.
 */
export function pluginFactory(readFileFn?: typeof fs.readFile): (config: CollageJsCssPluginOptions, aimOptions?: PluginOptions) => Promise<[Plugin, Plugin | null]> {
    const readFile = readFileFn ?? fs.readFile;
    return async (config: CollageJsCssPluginOptions, aimOptions?: PluginOptions) => {
        const cssOpt = await wjConfig()
            .addObject(config as CollageJsCssPluginOptions)
            .postMerge(async cfg => {
                cfg.localhostSsl ??= defaultOptions.localhostSsl;
                cfg.aim ??= defaultOptions.aim;
                cfg.entryPoints ??= defaultOptions.entryPoints;
                cfg.projectId ??= JSON.parse(await readFile('./package.json', { encoding: 'utf8' })).name;
                if (typeof cfg.projectId !== 'string') {
                    throw new Error("The 'projectId' option must be a string, or if defaulting to the project's name in package.json, that name must be a string.");
                }
                cfg.projectId = cfg.projectId.substring(0, 20);
                if (cfg.projectId.length === 0) {
                    throw new Error("The 'projectId' option cannot be an empty string, or if defaulting to the project's name in package.json, that name cannot be an empty string.");
                }
                // If necessary, this check can be generalized to check against characters that would be invalid in
                // file names under both Windows and Unix-like systems.  For now, this covers the cases where package 
                // names are scoped.
                if (cfg.projectId.includes('/')) {
                    throw new Error("The 'projectId' option (either explicitly set or inherited from the project's name in package.json) cannot include slashes ('/'), as it is used in asset file names and that would interfere with folder structure.");
                }
                return cfg;
            })
            .build();
        const lg = cssOpt.logging;
        if (lg?.chunks || lg?.config || lg?.incomingConfig) {
            openLog(lg?.fileName);
        }
        /**
         * Set in config() and is used to preserve Vite command information.
         */
        let viteEnv: ConfigEnv;
        /**
         * Base module path used to locate plug-in files.
         */
        const baseModulePath = path.dirname(fileURLToPath(import.meta.url));
        /**
         * Used to cache the built /Ex module.
         */
        let exModule: string;
        /**
         * Map of CSS files for CSS mounting.
         */
        const cssMap: CssMap = {};

        /**
         * Builds a full path using the provided file name and this module's file location.
         * @param fileName Module file name (just name and extension).
         * @returns The full path of the module.
         */
        function buildPeerModulePath(fileName: string) {
            return path.resolve(path.join(baseModulePath), fileName);
        }

        /**
         * Builds the Ex dynamic module.
         * @returns The finalized contents of the "@collagejs/vite-css/ex" module.
         */
        async function buildExModule() {
            return (await readFile(buildPeerModulePath('vite-env.js'), { encoding: 'utf8' }) as string)
                .replace("'{serving}'", `${viteEnv.command === 'serve'}`)
                .replace("'{built}'", `${viteEnv.command === 'build'}`)
                .replace('{mode}', viteEnv.mode)
                + '\n' + (await readFile(buildPeerModulePath(viteEnv.command === 'build' ? 'css.js' : 'no-css.js'), { encoding: 'utf8' }));
        }

        /**
         * Builds the configuration required for CollageJS projects.
         * @param cfg Incoming Vite configuration.
         * @param viteOpts Vite options.
         * @returns An object with the necessary Vite options for CollageJS projects.
         */
        async function mifeConfig(cfg: UserConfig, viteOpts: ConfigEnv) {
            const computedConfig: UserConfig = {};
            computedConfig.server = {
                port: cssOpt.serverPort,
                origin: `http${cssOpt.localhostSsl ? 's' : ''}://localhost:${cssOpt.serverPort}`,
            };
            computedConfig.preview = {
                port: cssOpt.serverPort,
            };
            const entryFileNames = '[name].js';
            const input: InputOption = {};
            let preserveEntrySignatures: InputOptions['preserveEntrySignatures'];
            if (viteOpts.command === 'build') {
                let entryPoints = cssOpt.entryPoints;
                if (typeof entryPoints === 'string') {
                    entryPoints = [entryPoints];
                }
                for (let ep of entryPoints) {
                    input[path.parse(ep).name] = ep;
                }
                preserveEntrySignatures = 'exports-only';
            }
            else {
                input['index'] = 'index.html';
                preserveEntrySignatures = false;
            }
            const assetFileNames = cssOpt.assetFileNames ?? 'assets/[name]-[hash][extname]';
            const fileInfo = path.parse(assetFileNames);
            const cssFileNames = path.join(fileInfo.dir, `cjcss(${cssOpt.projectId})${fileInfo.name}`);
            computedConfig.build = {
                rolldownOptions: {
                    input,
                    preserveEntrySignatures,
                    output: {
                        exports: 'auto',
                        entryFileNames,
                        ...(!Array.isArray(cfg.build?.rolldownOptions?.output) && cfg.build?.rolldownOptions?.output),
                        assetFileNames: ai => {
                            if (ai.names?.some(name => name.endsWith('.css'))) {
                                return cssFileNames;
                            }
                            return assetFileNames;
                        },
                    }
                }
            };
            if (lg?.config) {
                await writeToLog('# Plug-In Configuration\n\n');
                await writeToLog(markdownCodeBlock(formatData("%o", computedConfig)));
            }
            return computedConfig;
        }

        return [{
            name: '@collagejs/vite-css',
            async config(cfg, opts) {
                viteEnv = opts;
                if (lg?.incomingConfig) {
                    await writeToLog('# Incoming Configuration\n\n');
                    await writeToLog(markdownCodeBlock(formatData("%o", cfg)));
                }
                return await mifeConfig(cfg, opts);
            },
            resolveId: {
                order: 'pre',
                handler(source, importer, _options) {
                    if (allModuleNames.includes(source)) {
                        console.debug(`Resolving module ${source} imported by ${importer}`);
                        return source;
                    }
                    return null;
                }
            },
            async load(id, _options) {
                if (id === extensionModuleName) {
                    return exModule = exModule ?? (await buildExModule());
                }
                else if (allModuleNames.includes(id)) {
                    return await readFile(buildPeerModulePath(id), { encoding: 'utf8' });
                }
                return null;
            },
            async generateBundle(_options, bundle, _isWrite) {
                let errorOccurred = false;
                if (lg?.chunks) {
                    await writeToLog("# Chunk Information\n");
                }
                for (let chunk of Object.values(bundle)) {
                    let logData: string = '';
                    try {
                        if (lg?.chunks) {
                            logData += formatData("## %s", chunk.fileName);
                            logData += markdownCodeBlock(formatData("%o", chunk));
                        }
                        if (chunk.type === 'chunk' && chunk.isEntry) {
                            const cssFiles = new Set<string>();
                            const cssDynFiles = new Set<string>();
                            const processedImports = new Set<string>();
                            const collectCssFiles = (curChunk: RenderedChunk | undefined) => {
                                if (!curChunk) {
                                    return;
                                }
                                curChunk.viteMetadata?.importedCss?.forEach(css => cssFiles.add(css));
                                for (let imp of curChunk.imports || []) {
                                    if (processedImports.has(imp) || bundle[imp]?.type !== 'chunk') {
                                        continue;
                                    }
                                    processedImports.add(imp);
                                    collectCssFiles(bundle[imp]);
                                }
                            };
                            collectCssFiles(chunk);
                            processedImports.clear();
                            const collectDynamicCssFiles = (curChunk: RenderedChunk | undefined, first: boolean) => {
                                if (!curChunk) {
                                    return;
                                }
                                if (!first) {
                                    curChunk.viteMetadata?.importedCss?.forEach(css => cssDynFiles.add(css));
                                }
                                for (let imp of curChunk.dynamicImports || []) {
                                    if (processedImports.has(imp) || bundle[imp]?.type !== 'chunk') {
                                        continue;
                                    }
                                    processedImports.add(imp);
                                    collectDynamicCssFiles(bundle[imp], false);
                                }
                            };
                            collectDynamicCssFiles(chunk, true);
                            cssMap[chunk.name] = {
                                static: Array.from(cssFiles.values()),
                                dynamic: Array.from(cssDynFiles.values())
                            };
                        }
                    }
                    catch (error) {
                        errorOccurred = true;
                        throw error;
                    }
                    finally {
                        await writeToLog(logData);
                        if (errorOccurred) {
                            await closeLog();
                        }
                    }
                }
                // TODO: generateBundle probably only ever runs for builds, so the IF statement is probably unneeded.
                if (viteEnv.command === 'build') {
                    await closeLog();
                }
                const stringifiedCssMap = JSON.stringify(JSON.stringify(cssMap));
                for (let x in bundle) {
                    const entry = bundle[x];
                    if (entry?.type === 'chunk') {
                        entry.code = entry.code
                            ?.replace('{cjcss:PROJECT_ID}', cssOpt.projectId)
                            .replace(/['"]{cjcss:CSS_MAP}['"]/, stringifiedCssMap);
                    }
                }
            },
        }, cssOpt.aim ? cjsAimPlugin(aimOptions) : null];
    };
};

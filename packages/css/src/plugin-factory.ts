import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { CollageJsCssPluginOptions } from './types.js';
import { closeLog, formatData, markdownCodeBlock, openLog, writeToLog } from './debug.js';
import type { Plugin, ConfigEnv, UserConfig } from 'vite';
import type { InputOption, PreserveEntrySignaturesOption, RenderedChunk } from 'rollup';
import { cssHelpersModuleName, extensionModuleName, typesModuleName } from './ex-defs.js';

/**
 * Factory function that produces the `@collagejs/vite-css` plugin factory.  Yes, a factory of factories.
 * 
 * This indirection exists to allow for unit testing.
 * @param readFileFn Function used to read files.
 * @returns The plug-in factory function.
 */
export function pluginFactory(readFileFn?: typeof fs.readFile): (config: CollageJsCssPluginOptions) => Plugin {
    const readFile = readFileFn ?? fs.readFile;
    return (config: CollageJsCssPluginOptions) => {
        const lg = config.logging;
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
         * Project ID to use.
         */
        let projectId: string;
        /**
         * Map of CSS files for CSS mounting.
         */
        const cssMap: Record<string, string[]> = {};

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
            if (!config) {
                return computedConfig;
            }
            projectId = config.projectId ??
                JSON.parse(await readFile('./package.json', { encoding: 'utf8' })).name;
            projectId = projectId.substring(0, 20);
            computedConfig.server = {
                port: config.serverPort,
                origin: `http${config.localhostSsl ? 's' : ''}://localhost:${config.serverPort}`,
            };
            computedConfig.preview = {
                port: config.serverPort,
            };
            const entryFileNames = '[name].js';
            const input: InputOption = {};
            let preserveEntrySignatures: PreserveEntrySignaturesOption;
            if (viteOpts.command === 'build') {
                let entryPoints = config?.entryPoints ?? 'src/piece.ts';
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
            const assetFileNames = config.assetFileNames ?? 'assets/[name]-[hash][extname]';
            const fileInfo = path.parse(assetFileNames);
            const cssFileNames = path.join(fileInfo.dir, `cjcss(${projectId})${fileInfo.name}`);
            computedConfig.build = {
                rollupOptions: {
                    input,
                    preserveEntrySignatures,
                    output: {
                        exports: 'auto',
                        entryFileNames,
                        ...(!Array.isArray(cfg.build?.rollupOptions?.output) && cfg.build?.rollupOptions?.output),
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

        return {
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
                    if ([extensionModuleName, cssHelpersModuleName, typesModuleName].includes(source)) {
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
                else if (id === cssHelpersModuleName || id === typesModuleName) {
                    return await readFile(buildPeerModulePath(id), { encoding: 'utf8' });
                }
                return null;
            },
            async generateBundle(_options, bundle, _isWrite) {
                let errorOccurred = false;
                if (lg?.chunks) {
                    await writeToLog("# Chunk Information\n");
                }
                for (let x in bundle) {
                    const chunk = bundle[x];
                    let logData: string = '';
                    try {
                        if (lg?.chunks) {
                            logData += formatData("## %s", chunk.fileName);
                            logData += markdownCodeBlock(formatData("%o", chunk));
                        }
                        if (chunk.type === 'chunk' && chunk.isEntry) {
                            const cssFiles = new Set<string>();
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
                            cssMap[chunk.name] = [];
                            for (let css of cssFiles.values()) {
                                cssMap[chunk.name]!.push(css);
                            }
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
                            ?.replace('{cjcss:PROJECT_ID}', projectId)
                            .replace(/['"]{cjcss:CSS_MAP}['"]/, stringifiedCssMap);
                    }
                }
            },
        };
    };
};

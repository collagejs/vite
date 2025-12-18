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
         * Control variable used just for logging chunks to a log file.  When `true`, the title has already been written.
         */
        let chunkInfoTitleWrittenToLog = false;

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
         * @param viteOpts Vite options.
         * @returns An object with the necessary Vite options for CollageJS projects.
         */
        async function mifeConfig(viteOpts: ConfigEnv) {
            const cfg: UserConfig = {};
            if (!config) {
                return cfg;
            }
            projectId = config.projectId ??
                JSON.parse(await readFile('./package.json', { encoding: 'utf8' })).name;
            projectId = projectId.substring(0, 20);
            cfg.server = {
                port: config.serverPort,
                origin: `http${config.localhostSsl ? 's' : ''}://localhost:${config.serverPort}`,
            };
            cfg.preview = {
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
            cfg.build = {
                rollupOptions: {
                    input,
                    preserveEntrySignatures,
                    output: {
                        exports: 'auto',
                        assetFileNames: ai => {
                            if (ai.names?.some(name => name.endsWith('.css'))) {
                                return cssFileNames;
                            }
                            return assetFileNames;
                        },
                        entryFileNames
                    }
                }
            };
            if (lg?.config) {
                await writeToLog('# Plug-In Configuration\n\n');
                await writeToLog(markdownCodeBlock(formatData("%o", cfg)));
            }
            return cfg;
        }

        return {
            name: '@collagejs/vite-css',
            async config(cfg, opts) {
                viteEnv = opts;
                const cssModuleFileName = viteEnv.command !== 'build' ? 'no-css.js' : `css.js`;
                if (lg?.incomingConfig) {
                    await writeToLog('# Incoming Configuration\n\n');
                    await writeToLog(markdownCodeBlock(formatData("%o", cfg)));
                }
                return await mifeConfig(opts);
            },
            resolveId: {
                order: 'pre',
                handler(source, _importer, _options) {
                    if ([extensionModuleName, cssHelpersModuleName, typesModuleName].includes(source)) {
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
            },
            renderChunk: {
                order: 'post',
                async handler(_code, chunk, options, meta) {
                    let errorOccurred = false;
                    // Even if renderChunk is documented as "sequential", it is run in parallel for each chunk.
                    // This makes log entries mix with each other.  Solution:  Build the chunk log entry data 
                    // and then write it to the log in one call.
                    let logData: string = '';
                    try {
                        if (lg?.chunks) {
                            if (!chunkInfoTitleWrittenToLog) {
                                chunkInfoTitleWrittenToLog = true;
                                logData += formatData("# Chunk Information\n");
                            }
                            logData += formatData("## %s", chunk.fileName);
                            logData += markdownCodeBlock(formatData("%o", chunk));
                            logData += markdownCodeBlock(formatData("options: %o", options));
                            logData += markdownCodeBlock(formatData("meta: %o", meta));
                        }
                        if (chunk.isEntry) {
                            // Recursively collect all CSS files that this entry point might need.
                            const cssFiles = new Set<string>();
                            const processedImports = new Set<string>();
                            const collectCssFiles = (curChunk: RenderedChunk | undefined) => {
                                if (!curChunk) {
                                    return;
                                }
                                curChunk.viteMetadata?.importedCss.forEach(css => cssFiles.add(css));
                                for (let imp of curChunk.imports) {
                                    if (processedImports.has(imp)) {
                                        continue;
                                    }
                                    processedImports.add(imp);
                                    collectCssFiles(meta.chunks[imp]);
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
                },
            },
            async generateBundle(_options, bundle, _isWrite) {
                if (viteEnv.command === 'build') {
                    await closeLog();
                }
                const stringifiedCssMap = JSON.stringify(JSON.stringify(cssMap));
                for (let x in bundle) {
                    const entry = bundle[x];
                    if (entry?.type === 'chunk') {
                        entry.code = entry.code
                            ?.replace('{cjcss:PROJECT_ID}', projectId)
                            .replace('"{cjcss:CSS_MAP}"', stringifiedCssMap);
                    }
                }
            },
        };
    };
};

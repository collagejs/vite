import { Connect, createLogger, type Logger, type Plugin, type ResolvedConfig } from 'vite';
import { ManualResetEvent } from '@wjfe/async-workers';
import pc from "picocolors";
import { fmt, showCollageBanner, ImportMap } from "@collagejs/shared";
import type { PluginOptions } from './types.js';
import type { ExternalOption } from 'rollup';
import { resolver, type Resolver } from '@collagejs/importmap';

/**
 * The name of the plugin, used in Vite's plugin system and for logging purposes.
 * 
 * NOTE:  This is exported for testing purposes only.
 */
export const pluginName = '@collagejs/vite-aim';

/**
 * The default endpoint where to receive import map data from a client application.
 * 
 * NOTE:  This is exported for testing purposes only.
 */
export const defaultImportMapEndpoint = '/__import_map';

/**
 * Creates a function compliant with Rollup's ExternalOption that merges multiple externalization options.
 * 
 * **NOTE**:  Only exported for unit-testing purposes.
 * @param options Externalization options to merge.
 * @returns A function that effectively works as the merge of all provided externalization options.
 */
export function mergeExternalOptions(...options: ExternalOption[]): ExternalOption {
    return (source: string, importer: string | undefined, isResolved: boolean) => {
        for (const opt of options) {
            if (typeof opt === 'string') {
                if (source === opt) return true;
            }
            else if (opt instanceof RegExp) {
                if (opt.test(source)) return true;
            }
            else if (Array.isArray(opt)) {
                if (opt.includes(source) || opt.some(r => r instanceof RegExp && r.test(source))) {
                    return true;
                }
            }
            else {
                if (opt(source, importer, isResolved)) return true;
            }
        }
        return false;
    };
}

/**
 * Creates a Vite plugin for handling import maps in micro-frontend architectures.
 * 
 * This plugin:
 * - Exposes an HTTP endpoint to receive import map data from the shell application
 * - Provides a JavaScript sender script that can be included in the shell
 * - Uses received import maps to resolve and externalize bare module identifiers
 * - Handles CORS for cross-origin communication between shell and MFEs
 * 
 * @param options - Configuration options for the plugin
 * @returns Vite plugin object
 */
export function cjsAimPlugin(options: PluginOptions = {}): Plugin {
    const {
        importMapEndpoint = defaultImportMapEndpoint,
        allowedOrigins = [], // Developer must specify allowed origins
        pathExceptions = [],
        importMapTimeout = 2_000, // 2 seconds
        logLevel = undefined,
        banner = true,
        externals = undefined
    } = options;

    let config: ResolvedConfig;
    let importMap: ImportMap = { imports: {} };
    let importMapResolver: Resolver | undefined;
    let logger: Logger;
    const externalizedModules = new Set<string>();

    // ManualResetEvent to coordinate request blocking/unblocking
    const importMapReadyEvent = new ManualResetEvent(); // Initially unsignaled

    /**
     * Joins the given paths into a single path, ensuring proper slashes and making sure Vite's base is respected.
     * @param paths Paths to join together.
     * @returns The resultant path.
     */
    function joinPaths(...paths: string[]): string {
        paths.unshift(config.base);
        return paths.reduce((acc, part, index) => {
            part = (index === 0) ? part.trim().replace(/\/+$/g, '') : part.trim().replace(/^\/+|\/+$/g, '');
            if (part.length) {
                return acc + '/' + part;
            }
            return acc;
        }, '');
    }

    /**
     * Resolves a bare module identifier using the current import map.
     * @param id - The module identifier to resolve
     * @returns The resolved URL or null if no mapping found
     */
    const resolveFromImportMap = (id: string): string | null => {
        if (!importMapResolver) return null;
        return importMapResolver.resolve(id) ?? null;
    };

    return {
        name: pluginName,
        config(config, env) {
            if (env.command !== 'build' || !externals) {
                return;
            }
            // Merge externals into Vite build config
            if (config?.build?.rollupOptions?.external) {
                config.build.rollupOptions.external = mergeExternalOptions(
                    config.build.rollupOptions.external,
                    externals
                );
            }
            else {
                config.build ||= {};
                config.build.rollupOptions ||= {};
                config.build.rollupOptions.external = externals;
            }
        },
        configResolved(resolvedConfig) {
            config = resolvedConfig;
            logger = createLogger(logLevel ?? config.logLevel, { prefix: `[${pluginName}]` });
        },
        configureServer(devServer) {
            // Disable Vite's preTransformRequests.  After all, it will fail until the import maps are received.
            devServer.environments.client.config.dev.preTransformRequests = false;
            /**
             * Checks if origin is allowed to send import map data.
             */
            const isOriginAllowed = (origin: string | undefined): boolean => {
                if (!origin) return false;
                if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]')) {
                    return true;
                }
                // Check against developer-specified allowed origins
                return allowedOrigins.some(allowed => origin.includes(allowed));
            };

            const stockPathExceptions = [
                joinPaths('/@vite/client'),
            ];

            const allPathExceptions = [...new Set([...stockPathExceptions, ...pathExceptions.map(p => joinPaths(p))])];

            /**
             * Helper: Determines if this is a JavaScript request that should be blocked
             */
            const shouldBlockJavaScriptRequest = (req: Connect.IncomingMessage): boolean => {
                // Only block in development mode
                if (config.command !== 'serve') {
                    return false;
                }

                // Only block GET requests for JavaScript files
                if (req.method !== 'GET') {
                    return false;
                }

                if (ManualResetEvent.isSignaled(importMapReadyEvent.token)) {
                    return false;
                }

                // Path exceptions.
                if (allPathExceptions.some(ex => new RegExp(`^${ex}(?:\\?.*)?$`).test(req.url ?? ''))) {
                    return false;
                }
                return true;
            };

            // Import map endpoint - receives POST from @collagejs/imo
            devServer.middlewares.use(importMapEndpoint, (req, res) => {
                if (req.method === 'POST') {
                    const origin = req.headers.origin || req.headers.referer;

                    // Security check
                    if (!isOriginAllowed(origin)) {
                        logger.warn(`Rejected import map from unauthorized origin: ${pc.red(origin)}`, { timestamp: true });
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Origin not allowed' }));
                        return;
                    }

                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });

                    req.on('end', () => {
                        try {
                            const receivedImportMap = JSON.parse(body);
                            importMapResolver = resolver(receivedImportMap);
                            if (!importMapResolver.valid) {
                                logger.error(`Received import map is invalid.`);
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ errors: importMapResolver.validationResult.errors }));
                                importMapResolver = undefined;
                                return;
                            }
                            importMap = receivedImportMap;

                            const importCount = Object.keys(importMap.imports || {}).length;
                            const scopeCount = Object.keys(importMap.scopes || {}).length;

                            logger.info(fmt.success(`Received import map from ${fmt.url(origin)}: ${fmt.value(importCount)} imports, ${fmt.value(scopeCount)} scopes`), { timestamp: true });

                            if (importMap.imports) {
                                for (const [key, value] of Object.entries(importMap.imports)) {
                                    logger.info(`  ${fmt.keyword(key)} -> ${fmt.url(value)}`, { timestamp: true });
                                }
                            }

                            // Signal the event to unblock all waiting requests
                            importMapReadyEvent.signal();

                            res.writeHead(200, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            res.end(JSON.stringify({ success: true, imports: importCount }));
                        } catch (error) {
                            logger.error(`Failed to parse import map: ${error}`, { timestamp: true });
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid import map data' }));
                        }
                    });
                } else if (req.method === 'OPTIONS') {
                    // Handle CORS preflight
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    });
                    res.end();
                } else {
                    // Method not allowed
                    res.writeHead(405, {
                        'Content-Type': 'application/json',
                        'Allow': 'POST, OPTIONS'
                    });
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                }
            });

            // Request blocking middleware - blocks JS requests until import map received
            devServer.middlewares.use(async (req, _res, next) => {
                if (!shouldBlockJavaScriptRequest(req)) {
                    next();
                }
                logger.warn(`Blocking JS request until the import map is received: ${fmt.url(req.url)}`, { timestamp: true });
                try {
                    // Wait for import map event with timeout
                    const waitResponse = await ManualResetEvent.waitAsync(importMapReadyEvent.token, importMapTimeout);
                    if (waitResponse === 'timed-out') {
                        logger.warn(`Timeout waiting for import map, proceeding without it for: ${fmt.url(req.url)}`, { timestamp: true });
                    }
                    else {
                        logger.info(fmt.success(`Import map received, proceeding with: ${fmt.url(req.url)}`), { timestamp: true });
                    }
                } catch (error) {
                    logger.warn(`Error waiting for import map, proceeding without it for: ${fmt.url(req.url)}\nError: ${error}`, { timestamp: true });
                }
                next();
            });

            // Show CollageJS banner if enabled
            if (banner) {
                showCollageBanner();
            }
        },

        /**
         * Vite hook: resolves module identifiers.
         * 
         * For bare identifiers (e.g., starting with '@'):
         * - Returns the original bare identifier marked as external
         * - This allows the browser's import map to handle the actual resolution
         * - Prevents bundling while preserving the original identifier in output
         * 
         * @param id - The module identifier to resolve
         * @param importer - The module that is importing this identifier
         * @returns Resolution result or null to let other plugins handle
         */
        resolveId(id, _importer) {
            // Check if we have a mapping (for logging purposes)
            const resolved = resolveFromImportMap(id);
            if (resolved === null) {
                return null;
            }
            externalizedModules.add(resolved || id);
            return {
                id: resolved || id,
                external: true
            };
        },

        /**
         * Vite hook: called during bundle generation.
         * 
         * Logs information about which modules were externalized based on
         * the import map, useful for debugging and verification.
         * 
         * @param options - Rollup output options
         * @param bundle - The generated bundle
         */
        generateBundle() {
            // Log externalized modules during build
            if (externalizedModules.size > 0) {
                logger.info(`Externalized modules: ${fmt.value([...externalizedModules.values()].join(', '))}`, { timestamp: true });
            }
        },
    };
}

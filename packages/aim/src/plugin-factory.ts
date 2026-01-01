import { ConfigEnv, createLogger, type Logger, type Plugin, type ResolvedConfig } from 'vite';
import { ManualResetEvent } from '@wjfe/async-workers';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import pc from "picocolors";
import { fmt, showCollageBanner, ImportMap } from "@collagejs/shared";
import type { PluginOptions } from './types.js';
import type { ExternalOption } from 'rollup';

const pluginName = '@collagejs/vite-aim';

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

export function findLastImportStatement(code: string): number {
    const importRegex = /^\s*import\s.+;?$/gm;
    let lastIndex = -1;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(code)) !== null) {
        lastIndex = match.index + match[0].length;
    }
    return lastIndex;
}

export function transformStaticImportToDynamic(code: string): string {
    const sideFxModuleRegex = /^\s*import\s+['"](.*?)['"](;)?$/gm;
    const staticModuleRegex = /^\s*import\s+\{([^}]+?)\}\s+from\s+['"](.*?)['"](;)?$/gm;
    const staticDefModuleRegex = /^\s*import\s+(\S+)\s+from\s+['"](.*?)['"](;)?$/gm;
    
    return code
        .replace(sideFxModuleRegex, (_match, p1, p2) => {
            return `await import('${p1}')${p2 || ''}`;
        })
        .replace(staticModuleRegex, (_match, p1, p2, p3) => {
            // Handle named imports with proper alias syntax
            const imports = p1.split(',').map((i: string) => {
                const trimmed = i.trim();
                if (trimmed.includes(' as ')) {
                    // Keep original: local syntax for dynamic imports
                    const [original, alias] = trimmed.split(' as ').map(s => s.trim());
                    return `${original}: ${alias}`;
                }
                return trimmed;
            }).join(', ');
            return `const {${imports}} = await import('${p2}')${p3 || ''}`;
        })
        .replace(staticDefModuleRegex, (_match, p1, p2, p3) => {
            // Add .default for default imports
            return `const ${p1.trim()} = (await import('${p2}')).default${p3 || ''}`;
        });
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
export function importMapPlugin(options: PluginOptions = {}): Plugin {
    const {
        isRoot = true,
        isBareIdentifier = (id: string) => id.startsWith('@'),
        importMapEndpoint = '/__current_import_map',
        importMapSenderEndpoint = '/__collagejs-import-map-sender.js',
        allowedOrigins = [], // Developer must specify allowed origins
        importMapTimeout = 5_000, // 5 seconds
        logLevel = undefined,
        banner = true,
        externals = undefined
    } = options;

    let runEnv: ConfigEnv;
    let config: ResolvedConfig;
    let importMap: ImportMap = { imports: {} };
    let importMapSenderUrl: string;
    let importMapEndpointUrl: string;
    let logger: Logger;
    const externalizedModules = new Set<string>();

    // ManualResetEvent to coordinate request blocking/unblocking
    const importMapReadyEvent = new ManualResetEvent(); // Initially unsignaled

    function joinPaths(...paths: string[]): string {
        paths.unshift(config.base);
        return paths.map((part, index) => {
            if (index === 0) {
                return part.trim().replace(/\/+$/g, '');
            } else {
                return part.trim().replace(/^\/+|\/+$/g, '');
            }
        }).filter(x => x.length).join('/');
    }

    /**
     * Resolves a bare module identifier using the current import map.
     * 
     * Supports both direct mappings (exact match) and prefix mappings (trailing slash).
     * For example: "@demo/pure-ts" -> "http://localhost:4101/piece.js"
     * Or: "@demo/" -> "http://localhost:4101/" + remainder
     * 
     * @param id - The module identifier to resolve
     * @returns The resolved URL or null if no mapping found
     */
    const resolveFromImportMap = (id: string): string | null => {
        if (!importMap.imports) return null;

        // Direct mapping
        if (importMap.imports[id]) {
            return importMap.imports[id];
        }

        // Prefix mapping (e.g., "@demo/" -> "http://localhost:4101/")
        for (const [key, value] of Object.entries(importMap.imports)) {
            if (key.endsWith('/') && id.startsWith(key)) {
                const remainder = id.slice(key.length);
                return value + remainder;
            }
        }

        return null;
    };

    return {
        name: pluginName,
        config(config, env) {
            runEnv = env;
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
                config.build = config.build || {};
                config.build.rollupOptions = config.build.rollupOptions || {};
                config.build.rollupOptions.external = externals;
            }
        },
        configResolved(resolvedConfig) {
            config = resolvedConfig;
            importMapSenderUrl = joinPaths(importMapSenderEndpoint);
            importMapEndpointUrl = joinPaths(importMapEndpoint);
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
                joinPaths('/index.html'),
                joinPaths('/'),
                joinPaths('/@vite/client'),
                ...(isRoot ? [joinPaths(importMapSenderEndpoint)] : [])
            ];

            /**
             * Helper: Determines if this is a JavaScript request that should be blocked
             */
            const shouldBlockJavaScriptRequest = (req: any): boolean => {
                // Only block in development mode
                if (config.command !== 'serve') return false;

                // Only block GET requests for JavaScript files
                if (req.method !== 'GET') return false;

                if (ManualResetEvent.isSignaled(importMapReadyEvent.token)) {
                    return false;
                }

                // Path exceptions.
                if (stockPathExceptions.includes(req.url)) {
                    return false;
                }

                return true;
            };

            // Import map endpoint - receives POST from shell script
            devServer.middlewares.use(importMapEndpointUrl, (req, res) => {
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

                            // Validate import map structure
                            const validateIm: (im: unknown) => asserts im is ImportMap = (im: unknown): asserts im is ImportMap => {
                                if (typeof im !== 'object' || im === null) {
                                    throw new Error('Import map must be an object.');
                                }
                                // Can only have 2 keys: imports and scopes
                                const keys = Object.keys(im).sort();
                                if (keys.length !== 2 || keys[0] !== 'imports' || keys[1] !== 'scopes') {
                                    throw new Error('Import map can only contain "imports" and "scopes" keys.');
                                }
                            }
                            validateIm(receivedImportMap);

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
                    res.writeHead(200, {
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
                    return next();
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

            // Only serve import map sender script if this is the root application
            if (isRoot) {
                /**
                 * Serves the import map sender script for shell applications.
                 * 
                 * This script:
                 * - Extracts import map data from DOM
                 * - Identifies localhost origins from import-map-overrides
                 * - POSTs import map to all identified DEV servers
                 */
                devServer.middlewares.use(importMapSenderUrl, (_req, res) => {
                    res.writeHead(200, {
                        'Content-Type': 'application/javascript',
                        'Access-Control-Allow-Origin': '*'
                    });

                    try {
                        // Read the sender script from external file
                        const __filename = fileURLToPath(import.meta.url);
                        const __dirname = dirname(__filename);
                        const senderScriptPath = join(__dirname, 'import-map-sender.js');
                        let senderScript = readFileSync(senderScriptPath, 'utf-8');
                        // Replace placeholders with actual values
                        senderScript = senderScript
                            .replace(/}\)\(\);$/, `})(${isRoot}, '${importMapEndpointUrl}');`)
                        res.end(senderScript);
                    } catch (error) {
                        logger.error(`Failed to read sender script: ${error}`);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to load sender script' }));
                    }
                });
            }

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
            // Only handle bare identifiers that match our criteria
            // TODO: This restriction must go in order to support import maps for anything.
            if (!isBareIdentifier(id)) {
                return null;
            }

            // Check if we have a mapping (for logging purposes)
            const resolved = resolveFromImportMap(id);
            externalizedModules.add(resolved || id)
            return {
                id: resolved || id,
                external: true
            };
        },
        async transform(code, id, _options) {
            if (runEnv.command === 'build') {
            // if (isRoot || runEnv.command === 'build') {
                return null;
            }
            if (id.endsWith('/vite/dist/client/client.mjs')) {
                const imsScript = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'import-map-sender.js'), 'utf-8');
                const index = findLastImportStatement(code);
                if (index === -1) {
                    code = imsScript + '\n' + code;
                }
                else {
                    // code = imsScript + transformStaticImportToDynamic(code.slice(0, index)) + '\n' + code.slice(index);
                    code = code.slice(0, index) + '\n' + imsScript + '\n' + code.slice(index);
                }
                return {
                    code,
                    map: null,
                }
            }
            return null;
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

        // transformIndexHtml(html) {
        //     // Only inject the sender script in root/shell applications
        //     if (!isRoot) return html;
        //     // Inject the import map sender script into the HTML
        //     const scriptTag = `<script type="text/javascript" src="${importMapSenderUrl}" ${importMapSenderTagId}></script>`;
        //     return html.replace('</head>', `  ${scriptTag}\n</head>`);
        // }
    };
}

// export function generateImportMapSenderScript(isRoot: boolean, importMapSenderEndpoint: string) {

// }

export const importMapSenderTagId = 'data-collagejs-ims';

export default importMapPlugin;

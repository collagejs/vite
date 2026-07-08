import type { Connect, LogLevel } from "vite";
import type { ImportMap } from "@collagejs/importmap";

/**
 * Configuration options for the @collagejs/vite-aim plug-in.
 */
export interface CollageJsAimPluginOptions {
    /**
     * HTTP endpoint path for receiving import map data.
     * @default '/__import_map'
     */
    importMapEndpoint?: string;
    /**
     * Allowed origins that can send import map data (for security).
     * @default undefined
     */
    allowedOrigins?: string[];
    /**
     * Optional list of paths the Vite development server will allow through regardless of import maps data status.
     * 
     * In other words:  If the path is here, the request doesn't block because of missing import maps.
     * @default []
     */
    pathExceptions?: string[];
    /**
     * Timeout in milliseconds to wait for import map before serving without it.
     * @default 2_000
     */
    importMapTimeout?: number;
    /**
     * Log level for the plugin logger.
     * @default undefined (uses Vite's log level)
     */
    logLevel?: LogLevel | undefined;
    /**
     * Whether to show the *CollageJS* banner on startup.
     * @default true
     */
    banner?: boolean;
    /**
     * Import map used to externalize module identifiers while building.
     * 
     * This option is automatically populated by the `@collagejs/vite-im` plug-in when said plug-in injects this one.
     * 
     * This option is **not** populated by the `@collagejs/vite-css` plug-in, as this plug-in has no import map 
     * information at hand.  Always specify this option for *CollageJS* micro-frontend projects that rely on module 
     * identifiers that are defined in the import map by the root project, or alternatively use Vite's 
     * `build.rolldownOptions.external` option to externalize those module identifiers.
     * @default undefined
     */
    importMap?: ImportMap | undefined;
    /**
     * Predicate function to determine if a request should be blocked based on its URL.
     * 
     * **⚠️ BE CAREFUL**:  This can bring the entire development server to a halt if misused.  Use this option with
     * care and try to always rely on the stock predicate function provided by the plug-in.
     * @param request The incoming HTTP request object.
     * @param stockPredicate The default predicate function provided by the plug-in, which applies all documented rules
     * and behaviors.
     * @returns A boolean indicating whether the request should be blocked (`true`) or allowed (`false`).
     * @default undefined
     */
    shouldBlock?: (request: Connect.IncomingMessage, stockPredicate: () => boolean) => boolean;
}

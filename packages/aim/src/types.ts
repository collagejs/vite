import { LogLevel } from "vite";
import type { ExternalOption } from "rollup";

/**
 * Configuration options for the @collagejs/vite-aim plug-in.
 */
export interface PluginOptions {
    /**
     * Indicates if this is the root application (the one that provides the HTML document).
     * @default true
     */
    isRoot?: boolean;
    /**
     * Custom function to determine if a module is a bare identifier.
     */
    isBareIdentifier?: (id: string) => boolean;
    /**
     * HTTP endpoint path for receiving import map data.
     * @default '/__current_import_map'
     */
    importMapEndpoint?: string;
    /**
     * HTTP endpoint path for the import map sender script.
     * @default '/__collagejs-import-map-sender.js'
     */
    importMapSenderEndpoint?: string;
    /**
     * Allowed origins that can send import map data (for security).
     * @default undefined (allows only `localhost` origins)
     */
    allowedOrigins?: string[];
    /**
     * Optional list of paths the Vite development server will allow through regardless of import maps data status.
     * 
     * In other words:  If the path is here, the request doesn't block because of missing import maps.
     * 
     * ### Always-Present Exceptions
     * 
     * - If the `isRoot` option is `true`, then the paths `{base}` and `{base}/index.html` are never blocked.
     * - If the `isRoot` option is `false`, then there are no always-present exceptions.
     */
    pathExceptions?: string[];
    /**
     * Timeout in milliseconds to wait for import map before serving without it.
     * @default 3_000
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
     * Rollup externals configuration used during build.  The values specified here will be merged with the ones in 
     * Vite's `build.rollupOptions.external`, if any.
     * 
     * **IMPORTANT**:  Use this option instead of Vite's `build.rollupOptions.external` to externalize everything that 
     * is expected to be in the import maps.
     * 
     * Unfortunately, the automatic externalization resolution of this plug-in depends on Vite's development server.
     * @default undefined
     */
    externals?: ExternalOption | undefined;
}

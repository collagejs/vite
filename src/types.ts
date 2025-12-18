/**
 * Plug-in debugging options.
 */
export type DebuggingOptions = {
    /**
     * Logging options.
     */
    logging?: {
        /**
         * Log's file name.  If not provided, `'cjcss.md'` will be used if any of the logging flags is set to true.
         */
        fileName?: string;
        /**
         * Logs detailed information about the generated JavaScript chunks.
         */
        chunks?: boolean;
        /**
         * Logs the incoming Vite configuration (the one calculated before this plug-in modifies it).
         */
        incomingConfig?: boolean;
        /**
         * Logs the configuration changes proposed by this plug-in.
         */
        config?: boolean;
    }
};

/**
 * Defines the plugin options for Vite projects that export CollageJS pieces.
 */
export type CollageJsCssPluginOptions = {
    /**
     * The server port for this project.
     */
    serverPort: number;
    /**
     * Indicates whether the development server uses SSL (HTTPS) or not (HTTP).
     */
    localhostSsl?: boolean | undefined;
    /**
     * The path to the file that exports the CollageJS factory functions, or multiple paths if the project exports 
     * factories from multiple files.
     */
    entryPoints?: string | string[] | undefined;
    /**
     * Unique identifier given to the project.  It is used to tag CSS assets so the lifecycle functions in the 
     * automatic module `collagejs/vite-css/ex` can properly identify the CSS resources associated to this 
     * project.
     * 
     * If not provided, the project's name from `package.json` is used as identifier.
     * 
     * **NOTE**: Whatever is used as project ID will be truncated to the first 20 characters.
     */
    projectId?: string | undefined;
    /**
     * Pattern that specifies how asset file names are constructed.  Its default value is 
     * `assets/[name]-[hash][extname]`.  As seen, it can specify sub-folders.
     * 
     * Refer to [Rollup's documentation](https://rollupjs.org/configuration-options/#output-assetfilenames) for 
     * additional information.
     * 
     * **IMPORTANT**:  The CSS bundle file names will be in the form `cjcss(<project id>)<pattern>`.  The plug-in is 
     * smart enough to respect any folders in the pattern.
     */
    assetFileNames?: string | undefined;
} & DebuggingOptions;

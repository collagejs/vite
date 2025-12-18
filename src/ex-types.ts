/**
 * Vite environment object with information about how Vite is running or ran.
 */
export type ViteEnv = {
    /**
     * Boolean value that will be true if the project is currently being served by Vite using "vite serve".
     */
    serving: boolean,
    /**
     * Boolean value that will be true if the project is the result of Vite building ("vite build").
     */
    built: boolean,
    /**
     * The mode Vite received with the current command ("serve" or "build").  It usually is the string 
     * "development" for "vite serve" and "production" for "vite build", but mode can really be set to anything.
     */
    mode: string
};

/**
 * Defines the functionality required from custom logger objects.  Custom loggers are used to customize how and 
 * what gets into the browser's console, if anything.
 */
export type ILogger = {
    debug: Console['debug'];
    info: Console['info'];
    warn: Console['warn'];
    error: Console['error'];
}

/**
 * Options for the `cssMountFactory` function.
 */
export type CssMountFactoryOptions = {
    /**
     * Specifies a logger object or a Boolean value that controls what gets logged to the browser's console.
     * 
     * Set it to `true` (or don't specify it at all) to log to the browser's console; set it to `false` to turn 
     * off all logging to the console, or use it to pass a custom logger object to arbitrarily handle logging.
     */
    logger?: boolean | ILogger;
    /**
     * Specifies the amount of time to wait for a CSS LINK element to load before potentially aborting the mount 
     * operation.
     */
    loadTimeout?: number;
    /**
     * When set to `true`, a timeout event will abort the mount operation with a thrown error.
     */
    failOnTimeout?: boolean;
    /**
     * When set to `true`, an error event during CSS load will abort the mount operation with a thrown error.
     */
    failOnError?: boolean;
};

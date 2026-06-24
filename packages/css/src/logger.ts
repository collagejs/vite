import type { ILogger } from "./ex-types.js";

/**
 * Dud function to implement the silent logger.
 */
function noop() { };

/**
 * Silent logger used whenever no logging is desired.
 */
export const silentLogger: ILogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop
};

/**
 * Module-level variable for the logger of choice.
 */
let logger: ILogger = console;

/**
 * Configures the logger object according to the given logging option.
 * @param option Desired logging option.
 */
export function configureLogger(option: boolean | ILogger) {
    if (option === undefined) {
        throw new Error("A valid logging option must be provided.  Review your TypeScript settings since the parameter is typed as required and not undefined.");
    }
    logger = option === true ? console : option === false ? silentLogger : option;
}

/**
 * Obtains a reference to the current logger object.
 * 
 * @returns The current logger object.
 */
export function getLogger(): ILogger {
    return logger;
}

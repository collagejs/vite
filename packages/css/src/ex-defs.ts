/**
 * Module name of the module that is dynamically inserted by this plug-in for Vite projects to provide CSS injection.
 */
export const extensionModuleName = '@collagejs/vite-css/ex';
/**
 * Module name of the CSS helper module.
 */
export const cssHelpersModuleName = './css-helpers.js';
/**
 * Module name of the type definitions module.
 */
export const typesModuleName = './ex-types.js';
/**
 * Module name of the logger module.
 */
export const cssLoggerModuleName = './logger.js';
/**
 * Module name of the subscriber module.
 */
export const cssSubscriberModuleName = './Subscriber.js';
/**
 * Module name of the count controlled data module.
 */
export const cssCountControlledDataModuleName = './CountControlledData.js';
/**
 * Module name of the injected map module.
 */
export const injectedMapModuleName = './injected-map.js';
/**
 * Array of all module names that are dynamically inserted by this plug-in for Vite projects to provide CSS injection.
 */
export const allModuleNames = [
    extensionModuleName,
    cssHelpersModuleName,
    cssLoggerModuleName,
    cssSubscriberModuleName,
    cssCountControlledDataModuleName,
    injectedMapModuleName,
];

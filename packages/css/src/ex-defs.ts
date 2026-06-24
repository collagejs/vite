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
 * Array of all module names that are dynamically inserted by this plug-in for Vite projects to provide CSS injection.
 */
export const allModuleNames = [extensionModuleName, cssHelpersModuleName, cssLoggerModuleName];

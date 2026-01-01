/**
 * Defines how import maps look like.
 */
export type ImportMap = {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
};

/**
 * Defines the possible options for import maps in root projects.
 */
export type ImportMapsOption = {
    /**
     * Type of importmap.  The valid values are `'importmap'`, `'overridable-importmap'`, `'systemjs-importmap'` 
     * and `'importmap-shim'`.
     * 
     * **IMPORTANT**:  Keeping this for completeness, but *CollageJS* only officially supports native ES modules.
     */
    type?: 'importmap' | 'overridable-importmap' | 'systemjs-importmap' | 'importmap-shim';
    /**
     * File name or array of file names of the import map or maps to be used while developing.
     */
    dev?: string | string[];
    /**
     * File name or array of file names of the import map or maps to be used while building.
     */
    build?: string | string[];
};

/**
 * Defines the list of possible variants for the import-map-overrides user interface.  The Boolean value `true` is 
 * equivalent to the string `'full'`.
 */
export type ImoUiVariant = boolean | 'full' | 'popup' | 'list';

/**
 * Defines the complete set of options available to configure the import-map-overrides user interface.
 */
export type ImoUiOption = {
    /**
     * Desired variant of the user interface.  If not specified, the default value is `'full'`.
     */
    variant?: ImoUiVariant | undefined;
    /**
     * Desired button position.  If not specified, the default value is `'bottom-right'`.
     */
    buttonPos?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | undefined;
    /**
     * Local storage key used to control the visibility of the import-map-overrides user interface.  If not 
     * specified, the defualt value is `'imo-ui'`.
     * 
     * Set it to `true` to make the IMO UI always visible.
     */
    localStorageKey?: string | true | undefined;
};

/**
 * Defines the plugin options for Vite projects that are single-spa root projects (root configs).
 */
export type CollageJsImPluginOptions = {
    /**
     * Importmap options.
     */
    importMaps?: ImportMapsOption | undefined;
    /**
     * Controls the inclusion of the import-map-overrides package.  If set to `true`, or not specified at all, 
     * import-map-overrides will be included using the package's latest version.  In order to include a specific 
     * version, specify the version as a string (for example, `'2.4.2'`).
     * 
     * The package is served using the JSDelivr network; to use a different source, specify a function that 
     * returns the package's full URL as a string.
     */
    imo?: boolean | string | (() => string) | undefined;
    /**
     * Controls the inclusion of the import-map-overrides user interface.  Refer to the user interface 
     * documentation for the import-map-overrides package for full details.  The user interface is added unless 
     * explicitly deactivated in configuration.
     */
    imoUi?: ImoUiVariant | ImoUiOption | undefined;
};

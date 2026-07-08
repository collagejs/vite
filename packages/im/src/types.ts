import type { ImPostingOptions, ImoUiFactoryOptions } from "@collagejs/imo";

/**
 * Utility type that defines a type that is either `T` or `U`, but not both.
 */
export type Xor<T, U> =
  | (T & { [K in keyof U]?: never })
  | (U & { [K in keyof T]?: never });
/**
 * Defines the possible options for import maps in root projects.
 */
export type ImportMapsOption = {
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
 * Defines the full set of options that are accepted for import maps in root projects.
 */
export type ImportMapsSpec = ImportMapsOption | string | string[];

/**
 * Defines the various ways the source for `@collagejs/imo` can be specified.
 */
export type ImoSource = boolean | string | (() => string);

/**
 * Defines the full set of options that can be set to configure the behavior of `@collagejs/imo`'s import map-overriding 
 * script.
 */
export type ImoSpec = {
    /**
     * Specifies the source of `@collagejs/imo`.
     */
    source: ImoSource;
    options?: ImPostingOptions | undefined;
};

/**
 * Defines the plugin options for Vite projects that are CollageJS root projects (root configs).
 */
export type CollageJsImPluginOptions = {
    /**
     * Specifies the type and import map files to inject into the HTML page's HEAD element.
     * @default 'src/importMap.json'
     */
    importMaps?: ImportMapsSpec | undefined;
    /**
     * Controls the inclusion of the `@collagejs/imo` package.  If set to `true`, or not specified at all, 
     * `@collagejs/imo` will be included using the package's latest version.  In order to include a specific 
     * version, specify the version as a string (for example, `'1.0.0'`).
     * 
     * The package is served using the JSDelivr network; to use a different source, specify a function that 
     * returns the package's full URL as a string.
     * 
     * To specify import map posting options, specify this option as a POJO object.  Refer to the package's
     * documentation for additional information.
     * @default true
     */
    imo?: ImoSource | ImoSpec | undefined;
    /**
     * Controls the inclusion of the @collagejs/imo user interface.  Refer to the user interface documentation for the 
     * explanation on the various options that can be specified.
     * 
     * @default true
     */
    imoUi?: boolean | ImoUiFactoryOptions;
    /**
     * Controls the inclusion of the @collagejs/vite-aim plug-in.  When `false`, the AIM plug-in is not injected.
     * @default true
     */
    aim?: boolean;
};

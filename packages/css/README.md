# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;Vite-css Plug-In

This Vite plug-in can be used to generate a function compliant with the CollageJS `CorePiece.mount` specification.  This function knows, by virtue of its own nature, which CSS bundles are needed by any *CollageJS* pieces, and can therefore ensure they mount and dismount in synchrony with the piece or pieces.

## Quickstart

1. Install the plug-in:
    ```bash
    npm i -D @collagejs/vite-css
    ```
2. Add it to the list of Vite plug-ins in `vite.config.ts`:
    ```typescript
    import { collageJsCssPlugin } from "@collagejs/vite-css";

    export default defineConfig({
        plugins: [
            ...,
            collageJsCssPlugin({ serverPort: 4111 /*, etc. */ })
        ],
        ...
    });
    ```
3. On each input file, which by default is only the one named `src/piece.ts`, we import the CSS class factory, we instantiate **once** at the top of the module and then we use it once for every *CollageJS* piece object we create:
    ```typescript
    import { buildPiece } from "@collagejs/<insert your framework here>";
    import { CssFactory } from "@collagejs/vite-css/ex";
    ...

    // IMPORTANT:  The first argument should always be import.meta.url.
    const css = new CssFactory(import.meta.url /*, { options } */);

    export function myPieceFactory() {
        const piece = buildPiece(...);
        const { mount, relocate } = css.instantiate();
        return {
            ...piece,
            mount: [mount, piece.mount],
            relocate: [relocate, piece.relocate]
        };
    }
    ```

> Note how we call `css.instantiate()` every time we create a piece object.

This should work for any Vite-powered project.

⚠️ **IMPORTANT NOTES**

1. The CSS-mounting function features FOUC prevention, but it only works if it is listed *first* in the array of mount functions, like shown in the example.
2. The CSS-relocating function features rollback abilities, so it should not introduce risks related to the relocation operation.
3. The `relocate` lifecycle is optional.  Only use the CSS-relocating function if your *CollageJS* piece is relocatable.  So far, all official framework adapters default to creating relocatable pieces, but piece authors can change this.

## Plug-in Options

### `serverPort`

The only required option:  The port number this project will be assigned when running locally using `npm run dev` or `npm run preview`.

### `localhostSsl`

A Boolean value, whose default value is `false` that indicates if Vite's development server should use SSL (https).

### `input`

This is one very important option to know.  Its default value is `src/piece.ts`, but can also be an array of strings.  In short, this is the list of files that export *CollageJS* piece factories.  This is the list of modules whose exports we want visible.

### `projectId`

This should be set to a unique identifier of maximum 20 characters that uniquely identifies the *CollageJS* pieces provided by the Vite project.  It is used to uniquely name CSS bundles, so the automatic CSS-mounting algorithm can identify them properly.

If no value is provided, the package.json's `name` property will be used by default (or at least the first 20 characters of it).

> ⚠️ Be sure to provide a project ID or a name to your project in `package.json`.

### `assetFileNames`

This option accepts a Rolldown-compliant pattern for asset filenames.  Refer to its [documentation online](https://rolldown.rs/reference/OutputOptions.assetFileNames#assetfilenames) for full details.  Note, however, that the pattern will only be respected for non-CSS assets.  CSS files will be named in the form `cjcss(<project id>)<pattern>`, so not exactly the provided pattern.

By default, this option's value is `'assets/[name]-[hash][extname]'`.  Yes, you may add sub directories to the pattern.

## CSS Factory Options

### `loadTimeout`

The CSS-mounting algorithm provided by this package features FOUC (Flash Of Unstyled Content) prevention by ensuring the browser loads the CSS before giving way to the micro-frontend/piece mounting process.  This property, whose default value is `1500`, is used to set the amount of time (in milliseconds) the FOUC-prevention feature waits for CSS to load before giving up.

### `failOnTimeout` and `failOnError`

These properties, when set to `true`, tell the FOUC-prevention algorithm to throw an error whenever a CSS resource fails to load, or takes too long to load.  Their default value is `false`, which signals the algorithm to emit console warnings only.

When throwing errors, the micro-frontend/piece mounting process interrupts.

## Logging

The CSS mounting algorithm logs messages to the console by default.  If this is inconvenient, use the `configureLogger()` function:

```typescript
import { configureLogger } from "@collagejs/vite-css/ex";

configureLogger(...);
```

The `option` parameter accepts a Boolean value, or an object that fulfills the `ILogger` interface.  When set to `true` or not set, logging occurs through the browser's standard console.  When set to `false`, logging is turned off; when set to a custom logger object, then the logger object is used for logging, and the object decides what happens with those log entries.

### How and Where to Configure Logging

The logger object is a module level object (a singleton).  Usually, it only needs to be configured once per project.  If the project, however, contains more than one entry file (module), we don't know which entry file will be imported first.  So where to put this configuration?

The sanest option is to create an ES module with the side effect of calling this function.  Then import this ES module from all entry files.

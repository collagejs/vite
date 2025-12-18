# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;@collagejs/vite-css

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
3. On each input file, which by default is only the one named `src/piece.ts`, we import the function factory and use it in all factory functions that create *CollageJS* pieces:
    ```typescript
    import { buildPiece } from "@collagejs/<insert your framework here>";
    import { cssMountFactory } from "@collagejs/vite-css/ex";
    ...

    // IMPORTANT:  The first argument to the function is the file's name.
    // Assuming this is src/piece.ts, we pass "piece" (no extension).
    const cssMount = cssMountFactory('piece' /*, { options } */);

    export function myPieceFactory() {
        const piece = buildPiece(...);
        return {
            mount: [cssMount, piece.mount],
            update: piece.update
        };
    }
    ```

> Note how we build `cssMount` outside the factory function.  This is because we can reuse it in all factory functions exported by the module.  We only need one of these per module (not per factory function).

This should work for any Vite-powered project.

> ⚠️ **IMPORTANT**:  The CSS-mounting function features FOUC prevention, but it only works if it is listed *first* in the array of mount functions, like shown in the example.

## Plug-in Options

### `serverPort`

The only required option:  The port number this project will be assigned when running locally using `npm run dev` or `npm run preview`.

### `localhostSsl`

A Boolean value, whose default value is `false` that indicates if Vite's development server should use SSL (https).

### `entryPoints`

This is one very important option to know.  Its default value is `src/piece.ts`, but can also be an array of strings.  In short, this is the list of files that export *CollageJS* piece factories.  This is the list of modules whose exports we want visible.

### `projectId`

This should be set to a unique identifier of maximum 20 characters that uniquely identifies the *CollageJS* pieces provided by the Vite project.  It is used to uniquely name CSS bundles, so the automatic CSS-mounting algorithm can identify them properly.

If no value is provided, the package.json's `name` property will be used by default (or at least the first 20 characters of it).

> ⚠️ Be sure to provide a project ID or a name to your project in `package.json`.

### `assetFileNames`

This option accepts a Rollup-compliant pattern for asset filenames.  Refer to its [documentation online](https://rollupjs.org/configuration-options/#output-assetfilenames) for full details.  Note, however, that the pattern will only be respected for non-CSS assets.  CSS files will be named in the form `cjcss(<project id>)<pattern>`, so not exactly the provided pattern.

By default, this option's value is `'assets/[name]-[hash][extname]'`.  Yes, you may add sub directories to the pattern.

## Factory Function Options

### `logger`

Used to control where or when log entries go.  When set to `true` or not set, logging occurs through the browser's standard console.  When set to `false`, logging is turned off; when set to a custom logger object, then the logger object is used for logging, and the object decides what happens with those log entries.

### `loadTimeout`

The CSS-mounting algorithm provided by this package features FOUC (Flash Of Unstyled Content) prevention by ensuring the browser loads the CSS before giving way to the micro-frontend/piece mounting process.  This property, whose default value is `1500`, is used to set the amount of time (in milliseconds) the FOUC-prevention feature waits for CSS to load before giving up.

### `failOnTimeout` and `failOnError`

These properties, when set to `true`, tell the FOUC-prevention algorithm to throw an error whenever a CSS resource fails to load, or takes too long to load.  Their default value is `false`, which signals the algorithm to emit console warnings only.

When throwing errors, the micro-frontend/piece mounting process interrupts.

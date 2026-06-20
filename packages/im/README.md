# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;Vite-IM Plug-in

Vite plug-in for *CollageJS* projects that automatically inserts import maps and the import map-overriding package `@collagejs/imo` for easy micro-frontend development.

## Quickstart

1. Create your micro-frontend root project in your preferred framework.
2. Install the package:
    ```bash
    npm i -D @collagejs/vite-im
    ```
3. Create your import map files, usually at least `src/importMap.dev.json` and `src/importMap.json`.
4. Configure the plug-in.  In `vite.config.ts`:
    ```ts
    import { defineConfig } from "vite";
    import { cjsImPlugin } from "@collagejs/vite-im";

    export default defineConfig({
        plugins: [
            cjsImPlugin()
        ],
        ...
    });
    ```

Enjoy!  With the default settings, the plug-in:

+ Injects the import map defined in `src/importMap.dev.json` as an overridable import map during serve (`npm run dev`).
+ Injects the import map defined in `src/importMap.json` as an overridable import map during build (`npm run build`).
+ Injects the `@collagejs/imo` NPM package that takes care of overriding any import map entries as specified by the user/developer.
+ Injects the `@collagejs/imo` micro-frontend user interface to allow users/developers to manage import map overrides.
+ Injects the `@collagejs/vite-aim` plug-in for easy development.  This plug-in receives the resulting import map in the web application and is used to automatically externalize anything in the import map.

## Benefits

1. A plug-in is the only way of making use of import maps during Vite development, since Vite injects a client script that runs before anything developers add to the `<head>` HTML element, making manual import map injection impossible.
2. ✨We can import from micro-frontends statically!  No more dynamic imports with `/* @vite-ignore */` directives:
    ```ts
    import { myMfeFactory } from "@my/mfe"; //<-- where @my/mfe is only defined in the import map
    ```
3. Externalizations are only added in the import map.  No need to configure externalizations in Vite.

> ℹ️ **IMPORTANT**:  While static importation is in fact possible, TypeScript will complain.  Create [ambient modules](https://www.xjavascript.com/blog/typescript-ambient-module/) for your micro-frontends to make TypeScript happy.

# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;Vite-AIM Plug-in

**AIM** stands for "Auto-externalize Import Maps" and it refers to this plug-in's main functionality:  To externalize modules that are resolved by the application's import map.

## Quickstart

If you're doing micro-frontends with *CollageJS* and you're using the `@collagejs/vite-im` or `@collagejs/vite-css` plug-ins, then you are already using this plug-in.  Refer to the other plug-ins' documentation instead.  The following is for users using import maps outside the scope of *CollageJS*.

1. Install the package:
    ```bash
    npm i -D @collagejs/vite-aim
    ```
2. Add the plug-in to your Vite configuration file (usually `vite.config.ts`):
    ```typescript
    import { cjsAimPlugin } from "@collagejs/vite-aim";
    import { defineConfig } from "vite";

    export default defineConfig({
      plugins: [cjsAimPlugin()],
      rollupOptions: {
        build: {
          external: ['@my/bare-identifier']
        }
      }
    });
    ```

At this point and when starting the development server, the plug-in will start blocking HTTP GET requests until an import map is received.  When the part that sends the import map is not set up or running/working, the block is lifted in a per-request basis after a timeout.  So the development server will continue to work, but much slower.

As stated above, either create a small script that collects and sends the import map to the server using an HTTP POST request to the `/__import_map` endpoint (or whatever you specify in the plug-in options), or use `@collagejs/imo` directly, or even better, use `@collagejs/im` instead of directly using this plug-in, and you'll get more import map features, like merging source import maps and automatic import map injection.

### TypeScript and Bare Module Identifiers

We usually use a bare module identifier and an import map to load JavaScript modules from online sources, like CDN's.  The problem is:  We don't have sources or type definitions for those.  The browser is meant to obtain it once the web application is loaded.  This is a problem for TypeScript because it wants to help us write code, and not knowing what the module offers makes TypeScript sad.

To make TypeScript happy, we must provide the type definitions for the module.  There's more than one way to do this, but the most straightforward method is to define the ambient module in a `.d.ts` file, like this:

```typescript
@import type { CorePiece } "from @collagejs/core";

declare module "my-bare-specifier" {
  export function ...(): CorePiece<{ propertyA: number; propertyB: string; }>;
  export const ...
  ... // Etc.  Everything that the module exports, or at least what we use.
}
```

TypeScript should detect the ambient module and be happy once more.

#### The Maintainable Way

Companies that do micro-frontends should go the NPM package route and pack all ambient modules that comprise their micro-frontend solution in a single package that is then published to a *private* NPM repository.  The recommendation is for all private NPM packages to be scoped so we can easily add a `.npmrc` file with the repository specification:

```plaintext
@<company scope>=https://private-repo.company.com
```

## How This Works

The plug-in works by adding server middleware to Vite's development server.  The injected middleware does 2 things:

- Add an endpoint to accept import map information
- Block any incoming HTTP GET requests to allow the client to transmit the import map

The plug-in does not inject any code into the web page by itself.  Instead, it is reliant on the code that the `@collagejs/im` Vite plug-in should have injected, which in turns comes from the `@collagejs/imo` NPM package.

**Why bother?**

Without this plug-in, you must import from bare module identifiers in Vite projects like this:

```typescript
const moduleId = "@my/bare-specifier";

async function getPieceFactory() {
  const module = await import(/* @vite-ignore */ moduleId);
  return module.myPieceFactory;
}
```

1. We **cannot** statically import.
2. We **can only** import dynamically.
3. We **must** tell Vite to leave us alone.

But with this plug-in, we can statically import what we need directly:

```typescript
import { myPieceFactory } from "@my/bare-specifier";
```

> ✨ **TypeScript Developers**:  TypeScript will complain about the module definitions.  Provide module definitions in the form of a `.d.ts` file as explained above.

## Plug-In Options

### importMapEndpoint

Specifies the path where client code (usually from `@collagejs/imo`) can POST import map data.  Its default value is `"__import_map"`.

### allowedOrigins

This is a security measure, in case it is needed.  By default (when the option is not specified), only localhost origins can post import map data to the development server.  If this is inconvenient, provide an array of acceptable HTTP origins.

### pathExceptions

As stated before, this plug-in blocks HTTP GET requests for as long as no import map data has been received.  If this is inconvenient to your particular case, feel free to list any paths that should not be blocked using this property.

> 🌟 For root projects (`isRoot` set to `true`), there are always 2 exceptions "burned" in this list:  Vite's base path, and `<base path>/index.html`.

### importMapTimeout

Configures the maximum amount of time HTTP GET requests are blocked due to the lack of import map information.  Its default value is `2_000` milliseconds.

### logLevel

This plug-in logs to the developer's console, just like Vite does.  This option works the same as Vite's own `logLevel` option.  As a matter of fact, if this option is not specified, the plug-in will happily used the one configured for Vite itself.

### banner

Configures your preference regarding the banner that shows up in the console telling you how amazing CollageJS is.  If you prefer not to see it whenever the development server runs... well, this is the setting you'd need.

### externals

This plug-in is great because it allows developers to statically import from bare specifiers while also automatically externalizing anything found in the application's import map.  However, import map information can only be received when the development server runs.  This is not good for building.  For building (bundling), we must still specify the list of externals.

Most likely and until a better way comes up, you'll simply have to repeat the bare identifiers found in the import map in a list here.  This list is merged with the list configured in Vite's `build.rollupOptions.external`, but if possible, just use this setting.

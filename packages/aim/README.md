# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;Vite-AIM Plug-in

**AIM** stands for "Autoexternalize Import Maps" and it refers to this plug-in's main functionality:  To externalize modules that are resolved by the application's import map.

## How It Works

It works by injecting some JavaScript that collects the application's import map, and then transmits it to Vite's dev server.  While the dev server waits for the import map data, it blocks incoming HTTP GET requests, which are completed once the import map data is collected.

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

But with this plug-in, we can statically import:

```typescript
import { myPieceFactory } from "@my/bare-specifier";
```

> ✨ **TypeScript Developers**:  TypeScript will complain about the module definitions.  Provide module definitions in the form of a `.d.ts` file as explained below.

## Quickstart

If you're doing micro-frontends with *CollageJS* and you're using the `@collagejs/vite-im` or `@collagejs/vite-css` plug-ins, then you are already using this plug-in.  Refer to the other plug-ins' documentation instead.  The following is for users using import maps outside the scope of *CollageJS*.

1. Install the package:
    ```bash
    npm i -D @collagejs/vite-aim
    ```
2. Add the plug-in to your Vite configuration file (usually `vite.config.ts`):
    ```typescript
    import { collageJsAimPlugin } from "@collagejs/vite-aim";
    import { defineConfig } from "vite";

    export default defineConfig({
      plugins: [collageJsAimPlugin()],
      rollupOptions: {
        build: {
          external: ['@my/bare-identifier']
        }
      }
    });
    ```

At this point and when starting the development server, the plug-in will collect whatever import map is found in the document loaded by the browser and automatic externalization will kick in.

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

Companies that do micro-frontends should go the NPM package route and pack all ambient modules that comprise their micro-frontend modules in a package that is then published to a *private* NPM repository.  The recommendation is for all private NPM packages to be scoped so we can easily add a `.npmrc` file with the repository specification:

```plaintext
@<company scope>=https://private-repo.company.com
```

## Plug-In Options


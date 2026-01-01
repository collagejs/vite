# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;CollageJS Vite Plug-ins

This is the home repository for:

- 📦 `@collagejs/vite-im`:  Injects import maps and the `import-map-overrides` NPM package into the project's root HTML page.  It is used in root *CollageJS* projects.
- 📦 `@collagejs/vite-css`:  Injects a dynamic module capable of mounting and unmounting the bundled CSS files that Vite produces during its bundling process.  It supports Vite's CSS splitting.
- 📦 `@collagejs/vite-aim`:  **AIM** stands for "autoexternalize import maps".  This is a plug-in that extracts the web page's import map and uses its contents to resolve bare module identifiers on the fly, allowing developers to import code from micro-frontend modules as if they were installed (like an NPM package).

## 🏗️ Project Structure

```
├── .github/
│   └── copilot-instructions.md   # Project guidelines
├── packages/
│   ├── shared/                   # Code shared among all plug-ins
│   ├── aim/                      # Source code for @collagejs/vite-aim
│   ├── css/                      # Source code for @collagejs/vite-css
│   └── im/                       # Source code for @collagejs/vite-im
├── scripts/
│   ├── sync-shared.ts            # Utility script that enables the main trick for sharing code
├── package.json                  # Root workspace configuration
├── tsconfig.json                 # TypeScript project references
├── tsconfig.base.json            # Shared TypeScript configuration
├── .eslintrc.js                  # ESLint configuration
└── .prettierrc.json              # Prettier configuration
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 24.0.0
- npm >= 11.5.0

### Installation

```bash
# Install all dependencies for the monorepo
npm install

# Build all packages
npm run build
```

## 🛠️ Development

Before attempting development, we must understand the monorepo trick done here.  The author did not want to create an entire NPM package just to share code because this would impose a bundler on each of the package projects.

So instead, and before starting to modify code, execute the script that synchronizes (and watches) the shared code files with all plug-in source folders:

```bash
npm run watch-shared
```

The process will remain, watching for changes in the real source files under `/src/packages/shared/` and will synchronize changes to all package source code folders.

To reference a a shared source code file, use the path alias `$`:

```typescript
import { fmt } from '$/logging.js';

...
```

### Available Scripts

```bash
# Build all packages
npm run build

# Start development mode with file watching
npm run dev

# Run tests across all packages
npm run test

# Lint all packages
npm run lint

# Type check all packages
npm run type-check

# Clean build artifacts
npm run clean
```

### Working on Individual Packages

You can also work on individual packages:

```bash
# Navigate to a specific package
cd packages/aim

# Install dependencies (if needed)
npm install

# Build this package only
npm run build

# Watch mode for development
npm run dev
```

## 🧪 Testing Your Plugins

To test your plugins in a Vite project, you can:

1. Build the plugin: `npm run build`
2. Link it locally: `npm link` (in the plugin directory)
3. Use it in a test project: `npm link @collagejs/<package name>`

## 📝 Creating New Plugins

To add a new plugin to this monorepo:

1. Create a new directory in `packages/`
2. Copy the structure from an existing plugin
3. Update the package name and description
4. Add the new package to the TypeScript project references in the root `tsconfig.json`
5. Implement your plugin logic

## 🔧 Configuration

- **TypeScript**: Shared configuration in `tsconfig.base.json`
- **ESLint**: Root configuration in `.eslintrc.js`
- **Prettier**: Root configuration in `.prettierrc.json`

## 📄 License

MIT - see individual package.json files for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `npm run lint` and `npm run type-check`
6. Submit a pull request

### Using Shared Utilities

See [SHARED-USAGE.md](./SHARED-USAGE.md) for examples of how to use the shared utilities package in your plugins.

## 📚 Resources

- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [npm Workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces)
# <img src="https://raw.githubusercontent.com/collagejs/core/HEAD/src/logos/collagejs-48.svg" alt="CollageJS Logo" width="48" height="48" align="left">&nbsp;CollageJS Vite Plug-ins

This is the home repository for:

- 📦 `@collagejs/vite-im`:  Injects import maps and the `@collagejs/imo` NPM package into the project's root HTML page.  It is used in root *CollageJS* projects.
- 📦 `@collagejs/vite-css`:  Injects a dynamic module capable of mounting and unmounting the bundled CSS files that Vite produces during its bundling process.  It supports Vite's CSS splitting.  It is used in all other *CollageJS* projects.
- 📦 `@collagejs/vite-aim`:  **AIM** stands for "autoexternalize import maps".  This is a plug-in with server middleware that accepts the web page's import map and uses its contents to resolve bare module identifiers on the fly, allowing developers to import code from micro-frontend modules as if they were installed (like an NPM package). **Requires `@collagejs/imo` in the project.**

## 🚀 Quick Start

### Prerequisites
- Node.js >= 24.0.0
- npm >= 11.5.0

### Installation

```bash
# Install all dependencies for the monorepo.
# Will build all packages as well.
npm install
```

### Available Scripts

```bash
# Build all packages
npm run build

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
```

## 🧪 Testing Your Plugins

To test your plugins in a Vite project, you can:

1. Build the plugin: `npm run build`
2. Link it locally: `npm link` (in the plugin directory)
3. Use it in a test project: `npm link @collagejs/<package name>`

> **⚠️ IMPORTANT**:  Linking with `npm link` can only handle one linked package at a time.  The others must be built and installed either from an online repository or a NPM package file, which can be created with `npm pack`.

## 📝 Creating New Plugins

To add a new plugin to this monorepo:

1. Create a new directory in `packages/`
2. Update the package name and description
3. Add a `tsconfig.json` file similar or identical to one from another plug-in
4. Add the new package to the TypeScript project references in the root `tsconfig.json`
5. Implement the plugin logic

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

## 📚 Resources

- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [npm Workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces)

# Package Migration Guide

This document provides step-by-step instructions for migrating an existing TypeScript Vite plugin package into this monorepo structure.

## Prerequisites

- Your existing plugin package should be a TypeScript Vite plugin
- The monorepo is already set up with the shared utilities and build system

## Migration Steps

### Step 1: Copy Source Files

1. **Copy your plugin's source folder**:
   ```bash
   # Create the package directory
   mkdir packages/your-plugin-name
   
   # Copy your existing source files
   cp -r /path/to/your-existing-plugin/src packages/your-plugin-name/src
   ```

2. **Verify source structure**:
   ```
   packages/your-plugin-name/
   └── src/
       ├── index.ts          # Your main plugin file
       └── [other files...]  # Any additional source files
   ```

### Step 2: Create Package Configuration

Create `packages/your-plugin-name/package.json`:

```json
{
  "name": "@collagejs/your-plugin-name",
  "version": "1.0.0",
  "description": "Your plugin description",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "clean": "rimraf dist src/_shared"
  },
  "devDependencies": {
    "rimraf": "^5.0.5",
    "typescript": "^5.3.3"
  },
  "peerDependencies": {
    "vite": "^5.0.0"
  }
}
```

### Step 3: Create TypeScript Configuration

Create `packages/your-plugin-name/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": "./src",
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

### Step 4: Install Dependencies

```bash
cd packages/your-plugin-name
npm install
```

### Step 5: Update Import Statements

**If your plugin uses shared utilities**, update import statements in your source files:

**Before (if you had shared utilities)**:
```typescript
import { someUtility } from '../shared/utils.js';
import { Logger } from '@some-package/logger';
```

**After (using monorepo shared utilities)**:
```typescript
import { someUtility } from '$/utils.js';
```

### Step 6: Test the Integration

```bash
# From root directory
npm run build
```
  
✅ **Expected**: All packages build successfully, including your new one

## Common Issues and Solutions

### Issue: "Cannot find module './_shared'"

**Cause**: Shared code hasn't been synced to your package  
**Solution**:
```bash
# From root
npm run sync-shared

# Or from your package
npm run sync-shared
```

### Issue: TypeScript errors about rootDir

**Cause**: Import paths pointing outside the `src/` directory  
**Solution**: Ensure all imports use the `./_shared` pattern for shared code:
```typescript
// ❌ Wrong - outside rootDir
import { utils } from '../shared/src/utils';

// ✅ Correct - using centralized alias
import { utils } from './_shared';
```

### Issue: "Module resolution 'bundler' error"

**Cause**: Incompatible TypeScript configuration  
**Solution**: Use the exact `tsconfig.json` template from Step 3

### Issue: Package not building from root

**Cause**: Package not included in workspace  
**Solution**: Verify your package directory is under `packages/` and run:
```bash
npm install  # Reinstall to detect new workspace
```

## Available Shared Utilities

Your migrated plugin can now use these shared utilities:

### PluginLogger
```typescript
import { PluginLogger } from './_shared';

const logger = new PluginLogger('your-plugin');
logger.info('Plugin initialized');     // Blue with prefix
logger.success('Build complete');      // Green
logger.warn('Deprecated option');      // Yellow  
logger.error('Build failed');         // Red
```

### Environment Detection
```typescript
import { isDev, isProd } from './_shared';

if (isDev()) {
  // Development-specific code
  logger.info('Running in development mode');
}
```

### File Utilities
```typescript
import { /* available utilities */ } from './_shared';
// Check packages/shared/src/ for all available utilities
```

## Verification Checklist

After migration, verify:

- [ ] Package builds successfully: `cd packages/your-plugin && npm run build`
- [ ] Root build includes your package: `npm run build`
- [ ] Development mode works: `cd packages/your-plugin && npm run dev`  
- [ ] Shared utilities import correctly: `import { PluginLogger } from ''`
- [ ] TypeScript compilation has no errors
- [ ] Generated `dist/` folder contains `.js`, `.d.ts` files

## Next Steps

1. **Update your plugin logic** to use the shared utilities where beneficial
2. **Add tests** following the existing pattern in other packages
3. **Update documentation** specific to your plugin's functionality
4. **Consider contributing** new shared utilities that other plugins might use

Your plugin is now fully integrated into the monorepo build system!

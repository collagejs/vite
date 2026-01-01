import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        dts({
            include: ['src/**/*'],
            exclude: ['**/*.test.*', 'tests/**/*'],
            rollupTypes: true
        })
    ],
    build: {
        lib: {
            entry: {
                index: 'src/index.ts',
                'import-map-sender': 'src/import-map-sender.ts'
            },
            formats: ['es']
        },
        rollupOptions: {
            external: ['vite', 'rollup'],
            output: [
                {
                    format: 'es',
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name]-[hash].js'
                },
                // Special IIFE build for the import-map-sender
                // {
                //   format: 'iife',
                //   entryFileNames: (chunkInfo) => {
                //     return chunkInfo.name === 'import-map-sender' 
                //       ? 'import-map-sender.iife.js' 
                //       : '[name].iife.js';
                //   },
                //   name: 'CollageJSImportMapSender', // Global variable name for IIFE
                //   globals: {}
                // }
            ]
        }
    },
});
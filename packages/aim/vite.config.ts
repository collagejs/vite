import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        dts({
            include: ['src/**/*'],
            exclude: ['**/*.test.*', 'tests/**/*'],
            bundleTypes: true,
        })
    ],
    build: {
        minify: 'esbuild',
        lib: {
            entry: {
                index: 'src/index.ts',
            },
        },
        rollupOptions: {
            external: ['vite', 'rollup'],
            output: [
                {
                    format: 'es',
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name]-[hash].js'
                },
            ]
        }
    },
});
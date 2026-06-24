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
        minify: 'oxc',
        lib: {
            entry: {
                index: 'src/index.ts',
            },
        },
        rolldownOptions: {
            external: ['vite', 'rolldown'],
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
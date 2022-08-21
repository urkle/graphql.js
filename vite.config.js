import { resolve } from 'path'
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/graphql.js'),
            name: 'graphql.js',
            fileName: 'graphql.js'
        },
    },
    test: {
        mockReset: true,
        deps: {
            inline: [/\/node_modules\/vitest-plugin/],
        },
        setupFiles: [
            'tests/setup.js',
        ],
    },
    server: {
        proxy: {
            '^/graphql$': {
                target: 'http://localhost:8080',
                changeOrigin: true
            },
        },
    },
});
import { describe, it, expect } from 'vitest';
import { pluginFactory } from '../src/plugin-factory.js';
import path from 'path';
import type { OutputBundle, OutputChunk, OutputOptions, PreRenderedAsset, PreserveEntrySignaturesOption } from 'rollup';
import type { ConfigEnv, UserConfig } from 'vite';
import type { CollageJsCssPluginOptions } from "../src/types.js";
import { cssHelpersModuleName, extensionModuleName } from '../src/ex-defs.js';

type ConfigHandler = (this: void, config: UserConfig, env: ConfigEnv) => Promise<UserConfig>
type ResolveIdHandler = (this: void, source: string) => string;
type LoadHandler = (this: void, id: string) => Promise<string>;
type GenerateBundleHandler = (this: void, options: any, bundle: Record<string, any>) => Promise<void>;

const viteCommands: ConfigEnv['command'][] = [
    'serve',
    'build'
];

// Mocked package.json.
const pkgJson = {
    name: 'my-project'
};

const readPkgJsonFile = ((fileName: string) => {
    if (fileName !== './package.json') {
        throw new Error(`readFile received an unexpected file name: ${fileName}.`);
    }
    return Promise.resolve(JSON.stringify(pkgJson));
}) as Parameters<typeof pluginFactory>[0];

describe('pluginFactory', () => {
    it('Should default to micro-frontend configuration if type is not specified.', async () => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4100 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'serve', mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        expect(config.build).to.not.equal(undefined)
        expect(config.build!.rollupOptions).to.not.equal(undefined);
    });
    const portTest = async (cmd: ConfigEnv['command']) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: cmd, mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        expect(config.server).to.not.equal(undefined);
        expect(config.server!.port).to.equal(options.serverPort);
        expect(config.preview!.port).to.equal(options.serverPort);
    };
    for (let cmd of viteCommands) {
        it(`Should set the server and preview ports equal to the given port number on ${cmd}.`, () => portTest(cmd));
    }
    const inputTest = async (inputProp: string, viteCmd: ConfigEnv['command']) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        const input = config?.build?.rollupOptions?.input;
        expect(input).to.not.equal(undefined);
        expect(input).to.haveOwnProperty(inputProp);
    };
    it('Should specify the input "piece" on build under the rollup options.', () => inputTest('piece', 'build'));
    it('Should specify the input "index" on serve under the rollup options.', () => inputTest('index', 'serve'));
    const entrySignatureTest = async (viteCmd: ConfigEnv['command'], expectedPropValue: PreserveEntrySignaturesOption) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        const rollupOpts = config?.build?.rollupOptions;
        expect(rollupOpts).to.not.equal(undefined);
        expect(rollupOpts?.preserveEntrySignatures).to.equal(expectedPropValue);
    };
    it('Should set preserveEntrySignatures to "exports-only" on build under the rollup options.', () => entrySignatureTest('build', 'exports-only'));
    it('Should set preserveEntrySignatures to false on serve under the rollup options.', () => entrySignatureTest('serve', false));
    const fileNamesTest = async (propName: keyof OutputOptions) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        const outputOpts = config?.build?.rollupOptions?.output;
        expect(outputOpts).to.not.equal(undefined);
        const fileNameSetting = (outputOpts as OutputOptions)[propName];
        expect(fileNameSetting).to.not.match(/\[hash\]/);
    };
    it("Should set the output's entry file names to a hash-less pattern.", () => fileNamesTest('entryFileNames'));
    it("Should merge the user-provided rollup output options, allowing overrides.", async () => {
        // Arrange.
        const userEntryFileNames = 'custom-entry-[hash].js';
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };
        const userConfig: UserConfig = {
            build: {
                rollupOptions: {
                    output: {
                        entryFileNames: userEntryFileNames
                    }
                }
            }
        };

        // Act.
        const config = await (plugIn.config as ConfigHandler)(userConfig, env);

        // Assert.
        expect(config?.build?.rollupOptions?.output).to.not.equal(undefined);
        const entryFileNames = (config!.build!.rollupOptions!.output as OutputOptions).entryFileNames;
        expect(entryFileNames).to.equal(userEntryFileNames);
    });
    it("Should not accept overriding of 'assetFileNames'.", async () => {
        // Arrange.
        const userAssetFileNames = 'custom-asset-[hash][extname]';
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };
        const userConfig: UserConfig = {
            build: {
                rollupOptions: {
                    output: {
                        assetFileNames: userAssetFileNames
                    }
                }
            }
        };

        // Act.
        const config = await (plugIn.config as ConfigHandler)(userConfig, env);

        // Assert.
        expect(config?.build?.rollupOptions?.output).to.not.equal(undefined);
        const assetFileNames = (config!.build!.rollupOptions!.output as OutputOptions).assetFileNames;
        expect(assetFileNames).to.not.equal(userAssetFileNames);
    });
    it("Should ignore user-provided rollup output options if they are provided as an array.", async () => {
        // Arrange.
        const userEntryFileNames = 'custom-entry-[hash].js';
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };
        const userConfig: UserConfig = {
            build: {
                rollupOptions: {
                    output: [
                        {
                            entryFileNames: userEntryFileNames
                        }
                    ]
                }
            }
        };

        // Act.
        const config = await (plugIn.config as ConfigHandler)(userConfig, env);
        // Assert.
        expect(config?.build?.rollupOptions?.output).to.not.equal(undefined);
        const entryFileNames = (config!.build!.rollupOptions!.output as OutputOptions).entryFileNames;
        expect(entryFileNames).to.not.equal(userEntryFileNames);
    });
    const assetFileNameTest = async (pattern: string | undefined, cssExpectation: string, nonCssExpectation: string) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111, assetFileNames: pattern };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        const fn = (config.build?.rollupOptions?.output as OutputOptions).assetFileNames;
        if (typeof fn !== 'function') {
            expect(fn).to.equal(cssExpectation);
            expect(fn).to.equal(nonCssExpectation);
        }
        else {
            expect(fn({ names: ['a.css'] } as PreRenderedAsset)).to.equal(cssExpectation);
            expect(fn({ names: ['b.jpg'] } as PreRenderedAsset)).to.equal(nonCssExpectation);
        }
    };
    const assetFileNameTestData: {
        pattern?: string;
        cssExpectation: string;
        nonCssExpectation: string;
    }[] = [
            {
                cssExpectation: path.join('assets', `cjcss(${pkgJson.name})[name]-[hash][extname]`),
                nonCssExpectation: 'assets/[name]-[hash][extname]'
            },
            {
                pattern: 'assets/[name][extname]',
                cssExpectation: path.join('assets', `cjcss(${pkgJson.name})[name][extname]`),
                nonCssExpectation: 'assets/[name][extname]'
            },
            {
                pattern: 'assets/subdir/[name][extname]',
                cssExpectation: path.join('assets/subdir', `cjcss(${pkgJson.name})[name][extname]`),
                nonCssExpectation: 'assets/subdir/[name][extname]'
            },
            {
                pattern: '[name][extname]',
                cssExpectation: `cjcss(${pkgJson.name})[name][extname]`,
                nonCssExpectation: '[name][extname]'
            },
        ];
    assetFileNameTestData.forEach(tc => {
        it(`Should generate asset file names that respects the user configuration: ${tc.pattern ?? '(default pattern)'}`, () => assetFileNameTest(tc.pattern, tc.cssExpectation, tc.nonCssExpectation));
    });
    [
        {
            port: 4321,
            localhostSsl: false,
            expectedOrigin: 'http://localhost:4321'
        },
        {
            port: 4321,
            localhostSsl: true,
            expectedOrigin: 'https://localhost:4321'
        }
    ].forEach(tc => {
        it(`Should configure Vite's server.origin property as "${tc.expectedOrigin}".`, async () => {
            // Arrange.
            const options: CollageJsCssPluginOptions = { serverPort: tc.port, localhostSsl: tc.localhostSsl };
            const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
            const env: ConfigEnv = { command: 'build', mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            expect(config?.server?.origin).to.equal(tc.expectedOrigin);
        });
    });
    const exModuleIdResolutionTest = async (viteCmd: ConfigEnv['command'], source: string, expectedResult: string | null) => {
        // Arrange.
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugIn.config as ConfigHandler)({}, env);

        // Act
        // @ts-expect-error
        const resolvedId = (plugIn.resolveId?.handler as ResolveIdHandler)(source);

        // Assert.
        expect(resolvedId).to.equal(expectedResult);
    }
    const exModuleIdResolutionTestData = [
        {
            source: 'abc',
            expectedResult: null,
            text: 'not '
        },
        {
            source: extensionModuleName,
            expectedResult: extensionModuleName,
            text: ''
        },
        {
            source: '@collagejs/vite-css',
            expectedResult: null,
            text: 'not '
        },
        {
            source: cssHelpersModuleName,
            expectedResult: cssHelpersModuleName,
            text: ''
        }
    ];
    for (let cmd of viteCommands) {
        for (let tc of exModuleIdResolutionTestData) {
            it(`Should ${tc.text}positively identify the module ID "${tc.source}" on ${cmd}.`, () => exModuleIdResolutionTest(cmd, tc.source, tc.expectedResult));
        }
    }
    const exModuleBuildingTest = async (viteCmd: ConfigEnv['command'], moduleId: string, expectedModuleName: string) => {
        // Arrange.
        let expectedModuleRead = false;
        const moduleContent = 'abc - def';
        const readFile = ((fileName: string) => {
            const name = path.basename(fileName);
            if (name === 'package.json') {
                return Promise.resolve(JSON.stringify(pkgJson));
            }
            if (name === expectedModuleName) {
                expectedModuleRead = true;
                return Promise.resolve(moduleContent);
            }
            return Promise.resolve('');
        }) as Parameters<typeof pluginFactory>[0];
        const plugIn = (await pluginFactory(readFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugIn.config as ConfigHandler)({}, env);

        // Act.
        const moduleCode = await (plugIn.load as LoadHandler)(moduleId);

        // Assert.
        expect(expectedModuleRead).to.equal(true);
        expect(moduleCode).to.contain(moduleContent);
    };
    const exModuleBuildingTestData: { cmd: ConfigEnv['command'], moduleId: string, expectedModuleName: string }[] = [
        {
            cmd: 'build',
            moduleId: extensionModuleName,
            expectedModuleName: 'css.js',
        },
        {
            cmd: 'build',
            moduleId: extensionModuleName,
            expectedModuleName: 'vite-env.js',
        },
        {
            cmd: 'build',
            moduleId: cssHelpersModuleName,
            expectedModuleName: cssHelpersModuleName.substring(2),
        },
        {
            cmd: 'serve',
            moduleId: extensionModuleName,
            expectedModuleName: 'no-css.js',
        },
        {
            cmd: 'serve',
            moduleId: extensionModuleName,
            expectedModuleName: 'vite-env.js',
        },
    ];
    for (let tc of exModuleBuildingTestData) {
        it(
            `Should include the contents of module "${tc.expectedModuleName}" on ${tc.cmd} while loading module ID "${tc.moduleId}".`,
            () => exModuleBuildingTest(tc.cmd, tc.moduleId, tc.expectedModuleName)
        );
    }
    const viteEnvValueReplacementTest = async (viteCmd: ConfigEnv['command'], mode: ConfigEnv['mode']) => {
        // Arrange.
        const moduleContent = "'{serving}'\n'{built}'\n{mode}";
        const readFile = ((fileName: string) => {
            const name = path.basename(fileName);
            if (name === 'package.json') {
                return Promise.resolve(JSON.stringify(pkgJson));
            }
            if (name === 'vite-env.js') {
                return Promise.resolve(moduleContent);
            }
            return Promise.resolve('');
        }) as Parameters<typeof pluginFactory>[0];
        const plugIn = (await pluginFactory(readFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: viteCmd, mode: mode };
        await (plugIn.config as ConfigHandler)({}, env);

        // Act.
        const moduleCode = await (plugIn.load as LoadHandler)(extensionModuleName);

        // Assert.
        expect(moduleCode).to.contain(`${viteCmd === 'serve'}\n${viteCmd === 'build'}\n${mode}`);
    };
    const viteEnvValueReplacementTestData: { cmd: ConfigEnv['command'], mode: ConfigEnv['mode'] }[] = [
        {
            cmd: 'build',
            mode: 'production'
        },
        {
            cmd: 'serve',
            mode: 'development'
        },
        {
            cmd: 'build',
            mode: 'custom'
        },
        {
            cmd: 'serve',
            mode: 'custom-dev'
        }
    ];
    for (let tc of viteEnvValueReplacementTestData) {
        it(`Should replace the values of "viteEnv" appropriately on ${tc.cmd} with mode "${tc.mode}".`, () => viteEnvValueReplacementTest(tc.cmd, tc.mode));
    }
    const cssMapInsertionTest = async (bundle: OutputBundle, expectedMap: Record<string, string[]>) => {
        // Arrange.
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };
        await (plugIn.config as ConfigHandler)({}, env);
        for (let x in bundle) {
            const chunk = bundle[x] as OutputChunk;
            if (chunk.isEntry) {
                chunk.code = '"{cjcss:CSS_MAP}"';
            }
        }

        // Act.
        await (plugIn.generateBundle as GenerateBundleHandler)(null, bundle);

        // Assert.
        for (let x in bundle) {
            const chunk = bundle[x] as OutputChunk;
            if (chunk.isEntry) {
                const calculatedCssMap = JSON.parse(JSON.parse(chunk.code));
                expect(calculatedCssMap).to.deep.equal(expectedMap);
            }
        }
    };
    const buildSet = (items?: string[]) => new Set(items);
    const cssMapInsertionTestData = [
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['A.css'])
                    }
                }
            },
            text: 'A[1]:  a',
            expectedMap: {
                'A': ['A.css']
            }
        },
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: ['b.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet()
                    }
                },
                'b.js': {
                    type: 'chunk',
                    name: 'b',
                    fileName: 'b.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['b.css'])
                    }
                }
            },
            text: 'A, b[1]:  A->b',
            expectedMap: {
                'A': ['b.css']
            }
        },
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: ['b.js', 'c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet()
                    }
                },
                'b.js': {
                    type: 'chunk',
                    name: 'b',
                    fileName: 'b.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['b.css'])
                    }
                },
                'c.js': {
                    type: 'chunk',
                    name: 'c',
                    fileName: 'c.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['c.css'])
                    }
                }
            },
            text: 'A, b[1], c[1]:  A->bc',
            expectedMap: {
                'A': ['b.css', 'c.css']
            }
        },
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: ['b.js', 'c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['A.css'])
                    }
                },
                'b.js': {
                    type: 'chunk',
                    name: 'b',
                    fileName: 'b.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['b.css'])
                    }
                },
                'c.js': {
                    type: 'chunk',
                    name: 'c',
                    fileName: 'c.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['c.css'])
                    }
                }
            },
            text: 'A[1], b[1], c[1]:  A->bc',
            expectedMap: {
                'A': ['A.css', 'b.css', 'c.css']
            }
        },
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: ['b.js', 'c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['A.css'])
                    }
                },
                'b.js': {
                    type: 'chunk',
                    name: 'b',
                    fileName: 'b.js',
                    isEntry: false,
                    imports: ['c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['b.css'])
                    }
                },
                'c.js': {
                    type: 'chunk',
                    name: 'c',
                    fileName: 'c.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['c.css'])
                    }
                }
            },
            text: 'A[1], b[1], c[1]:  A->bc, b->c',
            expectedMap: {
                'A': ['A.css', 'b.css', 'c.css']
            }
        },
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: ['b.js', 'c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['A.css'])
                    }
                },
                'b.js': {
                    type: 'chunk',
                    name: 'b',
                    fileName: 'b.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['b.css'])
                    }
                },
                'c.js': {
                    type: 'chunk',
                    name: 'c',
                    fileName: 'c.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['c.css'])
                    }
                },
                'd.js': {
                    type: 'chunk',
                    name: 'd',
                    fileName: 'd.js',
                    isEntry: false,
                    imports: ['c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet()
                    }
                }
            },
            text: 'A[1], b[1], c[1], d[1]:  A->bc',
            expectedMap: {
                'A': ['A.css', 'b.css', 'c.css']
            }
        },
        {
            chunks: {
                'A.js': {
                    type: 'chunk',
                    name: 'A',
                    fileName: 'A.js',
                    isEntry: true,
                    imports: ['b.js', 'c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['A.css'])
                    }
                },
                'b.js': {
                    type: 'chunk',
                    name: 'b',
                    fileName: 'b.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['b.css'])
                    }
                },
                'c.js': {
                    type: 'chunk',
                    name: 'c',
                    fileName: 'c.js',
                    isEntry: false,
                    imports: [],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['c.css'])
                    }
                },
                'P.js': {
                    type: 'chunk',
                    name: 'P',
                    fileName: 'P.js',
                    isEntry: true,
                    imports: ['c.js'],
                    viteMetadata: {
                        importedAssets: buildSet(),
                        importedCss: buildSet(['P.css'])
                    }
                }
            },
            text: 'A[1], b[1], c[1], P[1]:  A->bc, P->c',
            expectedMap: {
                'A': ['A.css', 'b.css', 'c.css'],
                'P': ['P.css', 'c.css']
            }
        },
    ] as unknown as { chunks: OutputBundle; text: string; expectedMap: Record<string, string[]>; }[];
    for (let tc of cssMapInsertionTestData) {
        it(`Should insert the stringified CSS Map in chunks that need it: ${tc.text}`, () => cssMapInsertionTest(tc.chunks, tc.expectedMap));
    }
    const cssMapQuotationMarkReplacementTest = async (quote: '"' | "'") => {
        // Arrange.
        const moduleContent = `${quote}{cjcss:CSS_MAP}${quote}`;
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };
        await (plugIn.config as ConfigHandler)({}, env);
        const bundle = {
            'A.js': {
                type: 'chunk',
                name: 'A',
                fileName: 'A.js',
                isEntry: true,
                imports: [],
                viteMetadata: {
                    importedAssets: buildSet(),
                    importedCss: buildSet(['A.css'])
                },
                code: moduleContent
            } as unknown as OutputChunk
        };

        // Act.
        await (plugIn.generateBundle as GenerateBundleHandler)(null, bundle);

        // Assert.
        const entry = bundle['A.js'] as OutputChunk;
        const calculatedCssMap = JSON.parse(JSON.parse(entry.code));
        expect(calculatedCssMap).to.deep.equal({ 'A': ['A.css'] });
    };
    [
        {
            quote: '"' as const,
            text: 'double'
        },
        {
            quote: "'" as const,
            text: 'single'  
        }
    ].forEach(tc => {
        it(`Should correctly replace the CSS Map placeholder when it is wrapped in ${tc.text} quotes.`, () => cssMapQuotationMarkReplacementTest(tc.quote));
    });
    it("Should insert the package's name in the chunks that require it.", async () => {
        // Arrange.
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };
        await (plugIn.config as ConfigHandler)({}, env);
        const bundle = {
            'A.js': {
                type: 'chunk',
                code: '{cjcss:PROJECT_ID}'
            }
        };

        // Act.
        await (plugIn.generateBundle as GenerateBundleHandler)({}, bundle);

        // Assert.
        const entry = bundle['A.js'];
        expect(entry.code).to.equal(pkgJson.name);
    });
    it("Should insert the specified project ID in the chunks that require it.", async () => {
        // Arrange.
        const projectId = 'custom-pid';
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444, projectId }))[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };
        await (plugIn.config as ConfigHandler)({}, env);
        const bundle = {
            'A.js': {
                type: 'chunk',
                code: '{cjcss:PROJECT_ID}'
            }
        };

        // Act.
        await (plugIn.generateBundle as GenerateBundleHandler)({}, bundle);

        // Assert.
        const entry = bundle['A.js'];
        expect(entry.code).to.equal(projectId);
    });
    it("Should throw an error if the specified project ID is not a string.", async () => {
        // Arrange.
        const projectId = 12345 as unknown as string;

        // Act.
        const act = async () => await pluginFactory(readPkgJsonFile)({ serverPort: 4444, projectId });

        // Assert.
        await expect(act).rejects.toThrow();
    });
    it("Should throw an error if the project ID defaults to package.json's name but that name is not a string.", async () => {
        // Arrange.
        const readFile = ((fileName: string) => {
            if (fileName === './package.json') {
                return Promise.resolve(JSON.stringify({ name: 12345 }));
            }
            return Promise.resolve('');
        }) as Parameters<typeof pluginFactory>[0];

        // Act.
        const act = async () => await pluginFactory(readFile)({ serverPort: 4444 });

        // Assert.
        await expect(act).rejects.toThrow();
    });
    it("Should throw an error if the project ID is an empty string.", async () => {
        // Arrange.
        const projectId = '';

        // Act.
        const act = async () => await pluginFactory(readPkgJsonFile)({ serverPort: 4444, projectId });

        // Assert.
        await expect(act).rejects.toThrow();
    });
    it("Should throw an error if the project ID contains slashes.", async () => {
        // Arrange.
        const projectId = 'invalid/project';

        // Act.
        const act = async () => await pluginFactory(readPkgJsonFile)({ serverPort: 4444, projectId });

        // Assert.
        await expect(act).rejects.toThrow();
    });
    const spaEntryPointsTest = async (expects: Record<string, string>, inputs?: string | string[]) => {
        // Arrange.
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444, entryPoints: inputs }))[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };

        // Act.
        const result = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        expect(result).to.not.equal(undefined);
        const resultingInput = result.build?.rollupOptions?.input;
        expect(resultingInput).to.not.equal(undefined);
        expect(resultingInput).to.deep.equal(expects);
    }
    const spaEntryPointsTestData: { inputs: undefined | string | string[]; expects: Record<string, string> }[] = [
        {
            inputs: undefined,
            expects: {
                piece: 'src/piece.ts'
            }
        },
        {
            inputs: 'src/test.jsx',
            expects: {
                test: 'src/test.jsx'
            }
        },
        {
            inputs: ['src/abc.ts', 'src/def.js'],
            expects: {
                abc: 'src/abc.ts',
                def: 'src/def.js'
            }
        }
    ];
    for (let tc of spaEntryPointsTestData) {
        it(`Should add the specified entry points as inputs for rollup build.  Inputs: ${tc.inputs}`, () => spaEntryPointsTest(tc.expects, tc.inputs));
    }
});

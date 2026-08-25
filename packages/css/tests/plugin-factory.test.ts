import { describe, it, expect } from 'vitest';
import { pluginFactory, virtualizedExtensionModuleId } from '../src/plugin-factory.js';
import path from 'path';
import type { InputOptions, OutputBundle, OutputChunk, OutputOptions, PreRenderedAsset } from 'rolldown';
import type { ConfigEnv, UserConfig } from 'vite';
import type { CollageJsCssPluginOptions } from "../src/types.js";
import { allModuleNames, cssHelpersModuleName, cssLoggerModuleName, extensionModuleName } from '../src/ex-defs.js';
import { CssRecord } from '../src/private-types.js';

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
        expect(config.build!.rolldownOptions).to.not.equal(undefined);
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
        const input = config?.build?.rolldownOptions?.input;
        expect(input).to.not.equal(undefined);
        expect(input).to.haveOwnProperty(inputProp);
    };
    it('Should specify the input "piece" on build under the rolldown options.', () => inputTest('piece', 'build'));
    it('Should specify the input "index" on serve under the rolldown options.', () => inputTest('index', 'serve'));
    const entrySignatureTest = async (viteCmd: ConfigEnv['command'], expectedPropValue: InputOptions['preserveEntrySignatures']) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        const rolldownOpts = config?.build?.rolldownOptions;
        expect(rolldownOpts).to.not.equal(undefined);
        expect(rolldownOpts?.preserveEntrySignatures).to.equal(expectedPropValue);
    };
    it('Should set preserveEntrySignatures to "exports-only" on build under the rolldown options.', () => entrySignatureTest('build', 'exports-only'));
    it('Should set preserveEntrySignatures to false on serve under the rolldown options.', () => entrySignatureTest('serve', false));
    const fileNamesTest = async (propName: keyof OutputOptions) => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        const outputOpts = config?.build?.rolldownOptions?.output;
        expect(outputOpts).to.not.equal(undefined);
        const fileNameSetting = (outputOpts as OutputOptions)[propName];
        expect(fileNameSetting).to.not.match(/\[hash\]/);
    };
    it("Should set the output's entry file names to a hash-less pattern.", () => fileNamesTest('entryFileNames'));
    it("Should merge the user-provided rolldown output options, allowing overrides.", async () => {
        // Arrange.
        const userEntryFileNames = 'custom-entry-[hash].js';
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };
        const userConfig: UserConfig = {
            build: {
                rolldownOptions: {
                    output: {
                        entryFileNames: userEntryFileNames
                    }
                }
            }
        };

        // Act.
        const config = await (plugIn.config as ConfigHandler)(userConfig, env);

        // Assert.
        expect(config?.build?.rolldownOptions?.output).to.not.equal(undefined);
        const entryFileNames = (config!.build!.rolldownOptions!.output as OutputOptions).entryFileNames;
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
                rolldownOptions: {
                    output: {
                        assetFileNames: userAssetFileNames
                    }
                }
            }
        };

        // Act.
        const config = await (plugIn.config as ConfigHandler)(userConfig, env);

        // Assert.
        expect(config?.build?.rolldownOptions?.output).to.not.equal(undefined);
        const assetFileNames = (config!.build!.rolldownOptions!.output as OutputOptions).assetFileNames;
        expect(assetFileNames).to.not.equal(userAssetFileNames);
    });
    it("Should ignore user-provided rolldown output options if they are provided as an array.", async () => {
        // Arrange.
        const userEntryFileNames = 'custom-entry-[hash].js';
        const options: CollageJsCssPluginOptions = { serverPort: 4111 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };
        const userConfig: UserConfig = {
            build: {
                rolldownOptions: {
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
        expect(config?.build?.rolldownOptions?.output).to.not.equal(undefined);
        const entryFileNames = (config!.build!.rolldownOptions!.output as OutputOptions).entryFileNames;
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
        const fn = (config.build?.rolldownOptions?.output as OutputOptions).assetFileNames;
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
            const options: CollageJsCssPluginOptions = { serverPort: tc.port };
            const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
            const env: ConfigEnv = { command: 'build', mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({
                server: tc.localhostSsl ? { https: {} } : undefined
            }, env);

            // Assert.
            expect(config?.server?.origin).to.equal(tc.expectedOrigin);
        });
    });
    it("Should skip the server.origin configuration if the user configuration already specifies it.", async () => {
        // Arrange.
        const options: CollageJsCssPluginOptions = { serverPort: 4321 };
        const plugIn = (await pluginFactory(readPkgJsonFile)(options))[0];
        const env: ConfigEnv = { command: 'build', mode: 'development' };
        const config = await (plugIn.config as ConfigHandler)({
            server: {
                origin: 'http://example.com'
            }
        }, env);

        // Assert.
        expect(config?.server?.origin).to.equal(undefined);
    });
    const exModuleIdResolutionTest = async (viteCmd: ConfigEnv['command'], source: string, importer: string | undefined, expectedResult: string | null) => {
        // Arrange.
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444 }))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugIn.config as ConfigHandler)({}, env);

        // Act
        // @ts-expect-error
        const resolvedId = (plugIn.resolveId?.handler as ResolveIdHandler)(source, importer);

        // Assert.
        expect(resolvedId).to.equal(expectedResult);
    }
    const exModuleIdResolutionTestData = [
        {
            source: 'abc',
            importer: undefined,
            expectedResult: null,
            text: 'not '
        },
        {
            source: '@collagejs/vite-css',
            importer: undefined,
            expectedResult: null,
            text: 'not '
        },
        {
            source: extensionModuleName,
            importer: undefined,
            expectedResult: virtualizedExtensionModuleId,
            text: ''
        },
        ...allModuleNames.map(name => ({
            source: name,
            importer: virtualizedExtensionModuleId,
            expectedResult: `${virtualizedExtensionModuleId}/${name.replace(/^\.\//, '')}`,
            text: ''
        })),
        ...allModuleNames.map(name => ({
            source: name,
            importer: extensionModuleName,
            expectedResult: null,
            text: 'not '
        })),
    ];
    for (let cmd of viteCommands) {
        for (let tc of exModuleIdResolutionTestData) {
            it(`Should ${tc.text}positively identify the module ID "${tc.source}" on ${cmd}.`, () => exModuleIdResolutionTest(cmd, tc.source, tc.importer, tc.expectedResult));
        }
    }
    const exModuleBuildingTest = async (viteCmd: ConfigEnv['command'], moduleId: string, importer: string | undefined, expectedModuleName: string) => {
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
        // @ts-expect-error
        const resolvedId = (plugIn.resolveId?.handler as ResolveIdHandler)(moduleId, importer);

        // Act.
        const moduleCode = await (plugIn.load as LoadHandler)(resolvedId);

        // Assert.
        expect(expectedModuleRead).to.equal(true);
        expect(moduleCode).to.contain(moduleContent);
    };
    const exModuleBuildingTestData: {
        cmd: ConfigEnv['command'];
        moduleId: string;
        importer: string | undefined;
        expectedModuleName: string;
    }[] = [
        {
            cmd: 'build',
            moduleId: extensionModuleName,
            importer: undefined,
            expectedModuleName: 'css.js',
        },
        {
            cmd: 'build',
            moduleId: extensionModuleName,
            importer: undefined,
            expectedModuleName: 'vite-env.js',
        },
        ...allModuleNames.map(name => ({
            cmd: 'build' as const,
            moduleId: name,
            importer: virtualizedExtensionModuleId,
            expectedModuleName: name.substring(2),
        })),
        {
            cmd: 'serve',
            moduleId: extensionModuleName,
            importer: undefined,
            expectedModuleName: 'no-css.js',
        },
        {
            cmd: 'serve',
            moduleId: extensionModuleName,
            importer: undefined,
            expectedModuleName: 'vite-env.js',
        },
    ];
    for (let tc of exModuleBuildingTestData) {
        it(
            `Should include the contents of module "${tc.expectedModuleName}" on ${tc.cmd} while loading module ID "${tc.moduleId}".`,
            () => exModuleBuildingTest(tc.cmd, tc.moduleId, tc.importer, tc.expectedModuleName)
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
        const moduleCode = await (plugIn.load as LoadHandler)(virtualizedExtensionModuleId);

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
    const cssMapInsertionTest = async (bundle: OutputBundle, expectedMap: Record<string, CssRecord>) => {
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
                'A': {
                    static: ['A.css'],
                    dynamic: []
                }
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
                'A': {
                    static: ['b.css'],
                    dynamic: []
                }
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
                'A': {
                    static: ['b.css', 'c.css'],
                    dynamic: []
                }
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
                'A': { static: ['A.css', 'b.css', 'c.css'], dynamic: [] }
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
                'A': { static: ['A.css', 'b.css', 'c.css'], dynamic: [] }
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
                'A': { static: ['A.css', 'b.css', 'c.css'], dynamic: [] }
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
                'A': { static: ['A.css', 'b.css', 'c.css'], dynamic: [] },
                'P': { static: ['P.css', 'c.css'], dynamic: [] }
            }
        },
    ] as unknown as { chunks: OutputBundle; text: string; expectedMap: Record<string, CssRecord>; }[];
    for (let tc of cssMapInsertionTestData) {
        it(`Should insert the stringified CSS Map in chunks that need it: ${tc.text}`, () => cssMapInsertionTest(tc.chunks, tc.expectedMap));
    }
    const cssMapQuotationMarkReplacementTest = async (quote: '"' | "'" | "`") => {
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
        expect(calculatedCssMap).to.deep.equal({ 'A': { static: ['A.css'], dynamic: [] } });
    };
    [
        {
            quote: '"' as const,
            text: 'double'
        },
        {
            quote: "'" as const,
            text: 'single'  
        },
        {
            quote: "`" as const,
            text: 'backtick'  
        },
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
    const projectIdTestData = [
        {
            value: 12345,
            text: 'not a string'
        },
        {
            value: '',
            text: 'an empty string'
        },
        {
            value: 'some/id',
            text: 'a string containing slashes'
        },
    ]
    for (let tc of projectIdTestData) {
        it(`Should throw an error if the specified project ID is ${tc.text}.`, async () => {
            // Act.
            // @ts-expect-error TS2322
            const act = async () => await pluginFactory(readPkgJsonFile)({ serverPort: 4444, projectId: tc.value });
    
            // Assert.
            await expect(act).rejects.toThrow();
        });
        it(`Should throw an error if the project ID defaults to package.json's name but that name is ${tc.text}.`, async () => {
            // Arrange.
            const readFile = ((fileName: string) => {
                if (fileName === './package.json') {
                    return Promise.resolve(JSON.stringify({ name: tc.value }));
                }
                return Promise.resolve('');
            }) as Parameters<typeof pluginFactory>[0];
    
            // Act.
            const act = async () => await pluginFactory(readFile)({ serverPort: 4444 });
    
            // Assert.
            await expect(act).rejects.toThrow();
        });
    }
    const spaInputTest = async (expects: Record<string, string>, inputs?: string | string[]) => {
        // Arrange.
        const plugIn = (await pluginFactory(readPkgJsonFile)({ serverPort: 4444, input: inputs }))[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };

        // Act.
        const result = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        expect(result).to.not.equal(undefined);
        const resultingInput = result.build?.rolldownOptions?.input;
        expect(resultingInput).to.not.equal(undefined);
        expect(resultingInput).to.deep.equal(expects);
    }
    const spaInputTestData: { inputs: undefined | string | string[]; expects: Record<string, string> }[] = [
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
    for (let tc of spaInputTestData) {
        it(`Should add the specified entry files as inputs for rolldown build.  Inputs: ${tc.inputs}`, () => spaInputTest(tc.expects, tc.inputs));
    }
});

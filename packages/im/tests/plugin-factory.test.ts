import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultBuildImportMap, defaultDevImportMap, pluginFactory } from '../src/plugin-factory.js';
import type { ConfigEnv, HtmlTagDescriptor, IndexHtmlTransformHook, MinimalPluginContextWithoutEnvironment, UserConfig } from 'vite';
import type { CollageJsImPluginOptions, ImportMapsOption } from "../src/types.js";
import type { PathLike } from 'fs';
import type { ImportMap } from '@collagejs/importmap';
import type { ImoUiFactoryOptions } from '@collagejs/imo';
import type { CollageJsAimPluginOptions } from '@collagejs/vite-aim';
import { imoUiOptionsId } from '@collagejs/imo/const';

type ConfigHandler = (this: void, config: UserConfig, env: ConfigEnv) => Promise<UserConfig>

const mockedAimPlugin = vi.hoisted(() => {
    return vi.fn().mockReturnValue({});
});
vi.mock(import("@collagejs/vite-aim"), async () => {
    return {
        ...await vi.importActual("@collagejs/vite-aim"),
        cjsAimPlugin: mockedAimPlugin
    };
});

const viteCommands: ConfigEnv['command'][] = [
    'serve',
    'build'
];

function subSetOf(subset: Record<any, any>, superset: Record<any, any> | undefined) {
    if (!superset) {
        return false;
    }
    for (let [key, value] of Object.entries(subset)) {
        if (value !== superset[key]) {
            return false;
        }
    }
    return true;
}

function searchTag(tags: HtmlTagDescriptor[], tag: string, attrs?: HtmlTagDescriptor['attrs'], predicate?: (t: HtmlTagDescriptor) => boolean) {
    return tags.find(t => t.tag.indexOf(tag) === 0 && (!attrs || subSetOf(attrs, t.attrs)) && (predicate ?? (() => true))(t));
}

function searchForScriptTag(tags: HtmlTagDescriptor[], predicate?: (t: HtmlTagDescriptor) => boolean, attrs?: HtmlTagDescriptor['attrs']) {
    return searchTag(tags, 'script', { type: 'text/javascript', ...(attrs ?? {}) }, predicate);
}

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

function asHandlerDef(handler: unknown) {
    return handler as MinimalPluginContextWithoutEnvironment & { order: 'pre' | 'post' | null, handler: IndexHtmlTransformHook };
}

describe('pluginFactory', () => {
    const configTest = async (viteCmd: ConfigEnv['command']) => {
        // Assert.
        const plugIn = (await pluginFactory(readPkgJsonFile)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };

        // Act.
        const config = await (plugIn.config as ConfigHandler)({}, env);

        // Assert.
        expect(Object.keys(config)).to.have.length(0);
    };
    for (let cmd of viteCommands) {
        it(`Should return no configuration on ${cmd}.`, () => configTest(cmd));
    }
    const noImportMapTest = async (viteCmd: ConfigEnv['command']) => {
        // Arrange.
        const fileExists = () => false;
        const readFile = (() => Promise.reject()) as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            expect(xForm.tags).to.have.lengthOf(0);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    for (let cmd of viteCommands) {
        it(`Should not include any HTML tags into the HTML page if there is no import map file on ${cmd}.`, () => noImportMapTest(cmd));
    }
    it('Should not pick up the contents of "src/importMap.dev.json" if the file exists on build as the contents of the import map script.', async () => {
        const fileName = 'src/importMap.dev.json';
        const fileExists = (x: PathLike) => x === fileName;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        let fileReadCount = 0;
        const readFile = ((x: string) => {
            ++fileReadCount;
            if (x !== fileName) {
                throw new Error(`File not found: ${x}`);
            }
            return Promise.resolve(JSON.stringify(importMap));
        }) as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: 'build', mode: 'production' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(fileReadCount).to.equal(0);
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            expect(xForm.tags).to.have.lengthOf(0);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    });
    const defaultImportMapTest = async (fileName: string, viteCmd: ConfigEnv['command']) => {
        // Arrange.
        const fileExists = (x: PathLike) => x === fileName;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            },
            integrity: {}
        };
        let fileRead = false;
        const readFile = ((x: string) => {
            if (x === fileName) {
                fileRead = true;
            }
            return Promise.resolve(JSON.stringify(importMap));
        }) as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(fileRead).to.equal(true);
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const firstTag = xForm.tags[0];
            expect(firstTag).to.not.equal(undefined);
            expect(firstTag!.tag).to.equal('script');
            const parsedImportMap = JSON.parse(firstTag!.children as string);
            expect(parsedImportMap).to.be.deep.equal(importMap);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const defaultImportMapTestData: { fileName: string, viteCmd: ConfigEnv['command'] }[] = [
        {
            fileName: defaultDevImportMap,
            viteCmd: 'serve'
        },
        {
            fileName: defaultBuildImportMap,
            viteCmd: 'serve'
        },
        {
            fileName: defaultBuildImportMap,
            viteCmd: 'build'
        }
    ];
    for (let tc of defaultImportMapTestData) {
        it(`Should pick the contents of the default file "${tc.fileName}" if the file exists on ${tc.viteCmd} as the contents of the import map script.`, () => defaultImportMapTest(tc.fileName, tc.viteCmd));
    }
    it.each(viteCommands)("Should pick the contents of the single import map file specified if the file exists on %s as the contents of the import map script.", async (viteCmd) => {
        // Arrange.
        const fileName = 'customImportMap.json';
        const fileExists = (x: PathLike) => x === fileName;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            },
            integrity: {}
        };
        let fileRead = false;
        const readFile = ((x: string) => {
            if (x === fileName) {
                fileRead = true;
            }
            return Promise.resolve(JSON.stringify(importMap));
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions = { importMaps: fileName };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await(plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(fileRead).to.equal(true);
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const firstTag = xForm.tags[0];
            expect(firstTag).to.not.equal(undefined);
            expect(firstTag!.tag).to.equal('script');
            const parsedImportMap = JSON.parse(firstTag!.children as string);
            expect(parsedImportMap).to.be.deep.equal(importMap);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    });
    const importMapTest = async (propertyName: keyof ImportMapsOption, viteCmd: ConfigEnv['command']) => {
        // Arrange.
        const fileName = 'customImportMap.json';
        const fileExists = (x: PathLike) => x === fileName;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            },
            integrity: {}
        };
        let fileRead = false;
        const readFile = ((x: string) => {
            if (x === fileName) {
                fileRead = true;
            }
            return Promise.resolve(JSON.stringify(importMap));
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions = { importMaps: {} as ImportMapsOption };
        pluginOptions.importMaps[propertyName] = fileName;
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(fileRead).to.equal(true);
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const firstTag = xForm.tags[0];
            expect(firstTag).to.not.equal(undefined);
            expect(firstTag!.tag).to.equal('script');
            const parsedImportMap = JSON.parse(firstTag!.children as string);
            expect(parsedImportMap).to.be.deep.equal(importMap);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const importMapTestData: { propertyName: keyof ImportMapsOption, viteCmd: ConfigEnv['command'] }[] = [
        {
            propertyName: 'dev',
            viteCmd: 'serve'
        },
        {
            propertyName: 'build',
            viteCmd: 'build'
        }
    ];
    for (let tc of importMapTestData) {
        it(`Should pick the contents of the specified file in the "importMaps.${tc.propertyName}" configuration property on ${tc.viteCmd}.`, () => importMapTest(tc.propertyName, tc.viteCmd));
    }
    const importMapTestMultiple = async (map1: ImportMap, map2: ImportMap, expectedMap: ImportMap, propertyName: keyof ImportMapsOption, viteCmd: ConfigEnv['command']) => {
        // Arrange.
        expectedMap.integrity = {};
        const fileNames = ['A.json', 'B.json'];
        const fileExists = (x: PathLike) => fileNames.includes(x as string);
        const importMaps: Record<string, ImportMap> = {
            'A.json': map1,
            'B.json': map2
        };
        let fileRead: Record<string, boolean> = {};
        const readFile = ((x: string) => {
            if (fileNames.includes(x)) {
                fileRead[x] = true;
            }
            return Promise.resolve(JSON.stringify(importMaps[x]));
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions = { importMaps: {} as ImportMapsOption };
        pluginOptions.importMaps[propertyName] = fileNames;
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(Object.keys(fileRead).length).to.equal(2);
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const firstTag = xForm.tags[0];
            expect(firstTag).to.not.equal(undefined);
            expect(firstTag!.tag).to.equal('script');
            const parsedImportMap = JSON.parse(firstTag!.children as string);
            expect(parsedImportMap).to.be.deep.equal(expectedMap);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const importMapTestMultipleData: {
        map1: ImportMap,
        map2: ImportMap,
        expectedMap: ImportMap,
        propertyName: keyof ImportMapsOption,
        viteCmd: ConfigEnv['command']
    }[] = [
            {
                map1: {
                    imports: {
                        '@a/b': 'cd'
                    },
                    scopes: {
                        pickyModule: {
                            '@c/d': 'ef'
                        }
                    }
                },
                map2: {
                    imports: {
                        '@c/d': 'ef'
                    },
                    scopes: {
                        pickyModule: {
                            '@e/f': 'gh'
                        }
                    }
                },
                expectedMap: {
                    imports: {
                        '@a/b': 'cd',
                        '@c/d': 'ef'
                    },
                    scopes: {
                        pickyModule: {
                            '@c/d': 'ef',
                            '@e/f': 'gh'
                        }
                    }
                },
                propertyName: 'dev',
                viteCmd: 'serve'
            },
            {
                map1: {
                    imports: {
                        '@a/b': 'cd'
                    }
                },
                map2: {
                    imports: {
                        '@c/d': 'ef'
                    }
                },
                expectedMap: {
                    imports: {
                        '@a/b': 'cd',
                        '@c/d': 'ef'
                    },
                    scopes: {}
                },
                propertyName: 'build',
                viteCmd: 'build'
            }
        ];
    for (let tc of importMapTestMultipleData) {
        it(`Should pick the contents of all import maps specified in the "importMaps.${tc.propertyName}" configuration property on ${tc.viteCmd}.`,
            () => importMapTestMultiple(tc.map1, tc.map2, tc.expectedMap, tc.propertyName, tc.viteCmd));
    }
    const importMapTypeTest = async (viteCmd: ConfigEnv['command']) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = ((_x: string) => Promise.resolve(JSON.stringify(importMap))) as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { importMaps: {} };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const firstTag = xForm.tags[0];
            expect(firstTag).to.not.equal(undefined);
            expect(firstTag!.tag).to.equal('script');
            expect(firstTag!.attrs).to.not.equal(undefined);
            expect(firstTag!.attrs!.type).to.equal('overridable-importmap');
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    for (let cmd of viteCommands) {
        it(`Should set the import map type in the injected script tag to "overridable-importmap" on ${cmd}.`, () => importMapTypeTest(cmd));
    }
    const defaultImportMapTypeTest = async (viteCmd: ConfigEnv['command']) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const firstTag = xForm.tags[0];
            expect(firstTag).to.not.equal(undefined);
            expect(firstTag!.tag).to.equal('script');
            expect(firstTag!.attrs).to.not.equal(undefined);
            expect(firstTag!.attrs!.type).to.equal('overridable-importmap');
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    for (let cmd of viteCommands) {
        it(`Should set the import map type in the injected script tag to the default type "overridable-importmap" on ${cmd} when no type is specified.`, () => defaultImportMapTypeTest(cmd));
    }
    const postProcessTest = async (viteCmd: ConfigEnv['command']) => {
        const fileExists = () => false;
        const readFile = (() => {
            throw new Error('Not implemented');
        }) as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);

        // Act.
        const order = (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).order;

        // Assert.
        expect(order).to.equal('post');
    };
    for (let cmd of viteCommands) {
        it(`Should run HTML transformation as a post-processing handler on ${cmd}.`, () => postProcessTest(cmd));
    }
    const imoOnImportMapTest = async (viteCmd: ConfigEnv['command']) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes('@collagejs/imo@latest'));
            expect(imoTag).to.not.equal(undefined);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    for (let cmd of viteCommands) {
        it(`Should include a script tag for "@collagejs/imo" if there are import maps and the "imo" configuration property is not specified on ${cmd}.`, () => imoOnImportMapTest(cmd));
    }
    const imoVersionTest = async (viteCmd: ConfigEnv['command']) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
        const imoVersion = '2.4.2'
        const pluginOptions: CollageJsImPluginOptions = { imo: imoVersion };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes(`@collagejs/imo@${imoVersion}`));
            expect(imoTag).to.not.equal(undefined);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    for (let cmd of viteCommands) {
        it(`Should include a script tag for "@collagejs/imo" using the version specified in the "imo" configuration property on ${cmd}.`, () => imoVersionTest(cmd));
    }
    const imoFunctionTest = async (viteCmd: ConfigEnv['command']) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
        const imoUrl = 'https://cdn.example.com/@collagejs/imo@1.0.0';
        const pluginOptions: CollageJsImPluginOptions = { imo: () => imoUrl };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, undefined, { src: imoUrl });
            expect(imoTag).to.not.equal(undefined);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    for (let cmd of viteCommands) {
        it(`Should include a script tag for "@collagejs/imo" using the the URL returned by the function in the "imo" configuration property on ${cmd}.`, () => imoFunctionTest(cmd));
    }
    const imoBooleanTest = async (viteCmd: ConfigEnv['command'], imoValue: boolean) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { imo: imoValue };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes('@collagejs/imo@latest'));
            if (imoValue) {
                expect(imoTag).to.not.equal(undefined);
            }
            else {
                expect(imoTag).to.equal(undefined);
            }
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    const imoBooleanTestData = [
        {
            includesOrNot: 'not ',
            imoValue: false
        },
        {
            includesOrNot: '',
            imoValue: true
        }
    ];
    for (let tc of imoBooleanTestData) {
        for (let cmd of viteCommands) {
            it(`Should ${tc.includesOrNot}include the "@collagejs/imo" tag if the "imo" configuration property is set to "${tc.imoValue}" on ${cmd}.`, () => imoBooleanTest(cmd, tc.imoValue));
        }
    }
    const noImoOnNoImportMapTest = async (viteCmd: ConfigEnv['command'], imoValue: CollageJsImPluginOptions['imo']) => {
        const fileExists = () => false;
        const readFile = (() => {
            throw new Error('Not implemented.');
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { imo: imoValue };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t =>
                typeof imoValue === 'function' ?
                    (t.attrs!.src as string) === imoValue()
                    : (typeof imoValue === 'string' ?
                        ((t.attrs!.src as string) ?? '').includes(`@collagejs/imo@${imoValue}`) :
                        ((t.attrs!.src as string) ?? '').includes('@collagejs/imo@latest')));
            expect(imoTag).to.equal(undefined);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const noImoOnNoImportMapTestData: { imoValue: CollageJsImPluginOptions['imo'], valueDesc: string }[] = [
        {
            imoValue: true,
            valueDesc: 'true'
        },
        {
            imoValue: '2.4.2',
            valueDesc: 'a version number'
        },
        {
            imoValue: () => 'http://cdn.example.com/@collagejs/imo@1.0.0',
            valueDesc: 'a function'
        }
    ];
    for (let tc of noImoOnNoImportMapTestData) {
        for (let cmd of viteCommands) {
            it(`Should not include "@collagejs/imo" if no import map is available on ${cmd}, even if "imo" is set to ${tc.valueDesc} on ${cmd}.`, () => noImoOnNoImportMapTest(cmd, tc.imoValue));
        }
    }
    const imoUiDefaultsTest = async (viteCmd: ConfigEnv['command'], importMapExists: boolean) => {
        const fileExists = () => importMapExists;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => {
            return Promise.resolve(JSON.stringify(importMap));
        }) as unknown as Parameters<typeof pluginFactory>[0];
        const plugin = (await pluginFactory(readFile, fileExists)())[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, 'script', { type: 'module' }, t => t.injectTo === 'body' && (t.attrs?.src?.toString().endsWith('imo-ui.js') ?? false));
            const assertFn = importMapExists ? () => expect(imoUiTag).to.not.equal(undefined) : () => expect(imoUiTag).to.equal(undefined);
            assertFn();
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const imoUiDefaultsTestData = [
        {
            importMap: false,
            text1: 'not ',
            text2: 'no '
        },
        {
            importMap: true,
            text1: '',
            text2: ''
        }
    ]
    for (let cmd of viteCommands) {
        for (let tc of imoUiDefaultsTestData) {
            it(`Should ${tc.text1}include the "@collagejs/imo" UI script when the "imoUi" property is not explicitly set on ${cmd} and there are ${tc.text2}import maps.`, () => imoUiDefaultsTest(cmd, tc.importMap));
        }
    }
    const imoUiIncludeTest = async (viteCmd: ConfigEnv['command'], imoUi: boolean | ImoUiFactoryOptions | undefined, expectToExist: boolean) => {
        const fileExists = () => true;
        const importMap = {
            imports: {
                '@a/b': 'cd'
            },
            scopes: {
                pickyModule: {
                    '@a/b': 'ef'
                }
            }
        };
        const readFile = (() => {
            return Promise.resolve(JSON.stringify(importMap));
        }) as unknown as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { imoUi };
        const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, `script`, {}, t => t.injectTo === 'body' && (t?.attrs?.['src']?.toString().endsWith('/imo-ui.js') ?? false));
            const assertFn = expectToExist ? () => expect(imoUiTag).to.not.equal(undefined) : () => expect(imoUiTag).to.equal(undefined);
            assertFn();
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const imoUiIncludeTestData: (boolean | ImoUiFactoryOptions | undefined)[] = [
        undefined,
        true,
        {}
    ];
    for (let cmd of viteCommands) {
        for (let tc of imoUiIncludeTestData) {
            it(`Should include "@collagejs/imo"'s UI script when the "imoUi" property is set to ${tc} on ${cmd}.`, () => imoUiIncludeTest(cmd, tc, true));
        }
        it(`Should not include "@collagejs/imo"' UI script when the "imoUi" property is set to false on ${cmd}.`, () => imoUiIncludeTest(cmd, false, false));
    }
    describe("IMO UI Options", () => {
        for (let cmd of viteCommands) {
            ([
                true,
                {},
            ] as (boolean | ImoUiFactoryOptions)[]).forEach((imoUi) => {
                it(`Should insert the IMO UI options script tag into the HTML page when the 'imoUi' property is set to ${JSON.stringify(imoUi)} during ${cmd}.`, async () => {
                    // Arrange.
                    const fileExists = () => true;
                    const importMap = {
                        imports: {
                            '@a/b': 'cd'
                        },
                        scopes: {}
                    };
                    const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
                    const pluginOptions: CollageJsImPluginOptions = { imoUi };
                    const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
                    const env: ConfigEnv = { command: cmd, mode: 'development' };
                    await (plugin.config as ConfigHandler)({}, env);
                    const ctx = { path: '', filename: '' };

                    // Act.
                    const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

                    // Assert.
                    expect(xForm).to.not.equal(null);
                    expect(xForm).to.not.equal(undefined);
                    if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                        expect(xForm.tags.length).toBeGreaterThan(0);
                        const tag = searchTag(xForm.tags, 'script', { type: 'application/json', id: imoUiOptionsId });
                        expect(tag).to.not.equal(undefined);
                    }
                    else {
                        throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
                    }
                });
            });
            it(`Should always include the "base" UI factory option during ${cmd}.`, async () => {
                // Arrange.
                const fileExists = () => true;
                const importMap = {
                    imports: {
                        '@a/b': 'cd'
                    },
                    scopes: {}
                };
                const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
                const plugin = (await pluginFactory(readFile, fileExists)())[0];
                const env: ConfigEnv = { command: cmd, mode: 'development' };
                await (plugin.config as ConfigHandler)({}, env);
                const ctx = { path: '', filename: '' };

                // Act.
                const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

                // Assert.
                expect(xForm).to.not.equal(null);
                expect(xForm).to.not.equal(undefined);
                if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                    expect(xForm.tags.length).toBeGreaterThan(0);
                    const tag = searchTag(xForm.tags, 'script', { type: 'application/json', id: imoUiOptionsId });
                    expect(tag).to.not.equal(undefined);
                    const options: ImoUiFactoryOptions = JSON.parse(tag!.children as string);
                    expect(options.base).toBeDefined();
                }
                else {
                    throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
                }
            });
            it(`Should allow the "base" UI factory option to be overridden during ${cmd}.`, async () => {
                // Arrange.
                const fileExists = () => true;
                const importMap = {
                    imports: {
                        '@a/b': 'cd'
                    },
                    scopes: {}
                };
                const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
                const pluginOptions = { imoUi: { base: '/custom-base' } } satisfies CollageJsImPluginOptions;
                const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[0];
                const env: ConfigEnv = { command: cmd, mode: 'development' };
                await (plugin.config as ConfigHandler)({}, env);
                const ctx = { path: '', filename: '' };

                // Act.
                const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

                // Assert.
                expect(xForm).to.not.equal(null);
                expect(xForm).to.not.equal(undefined);
                if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                    expect(xForm.tags.length).toBeGreaterThan(0);
                    const tag = searchTag(xForm.tags, 'script', { type: 'application/json', id: imoUiOptionsId });
                    expect(tag).to.not.equal(undefined);
                    const options: ImoUiFactoryOptions = JSON.parse(tag!.children as string);
                    expect(options.base).toBe(pluginOptions.imoUi.base);
                }
                else {
                    throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
                }
            });
        }
    });
    describe("AIM Plug-In", () => {
        afterEach(() => {
            mockedAimPlugin.mockClear();
        });
        it.each([
            {
                aim: undefined,
                text: 'include',
            },
            {
                aim: true,
                text: 'include',
            },
            {
                aim: false,
                text: 'not include',
            }
        ])("Should $text the AIM plug-in whenever the 'aim' property is $aim .", async ({ aim }) => {
            // Arrange.
            const fileExists = () => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
            const pluginOptions: CollageJsImPluginOptions = { aim };

            // Act.
            const plugin = (await pluginFactory(readFile, fileExists)(pluginOptions))[1];

            // Assert.
            if (aim !== false) {
                expect(plugin).toBeTruthy();
            }
            else {
                expect(plugin).toBeNull();
            }
        });
        it("Should pass the build-time import maps to the AIM plug-in.", async () => {
            // Arrange.
            const fileExists = () => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                },
                integrity: {}
            };
            const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];

            // Act.
            const plugin = (await pluginFactory(readFile, fileExists)())[1];

            // Assert.
            expect(plugin).toBeTruthy();
            expect(mockedAimPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({ importMap }));
        });
        it("Should pass the stock path exceptions to the AIM plug-in.", async () => {
            // Arrange.
            const pathExceptions = ['/', '/index.html'];
            const fileExists = () => false;

            // Act.
            const plugin = (await pluginFactory(undefined, fileExists)())[1];

            // Assert.
            expect(plugin).toBeTruthy();
            expect(mockedAimPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({ pathExceptions }));
        });
        it("Should allow explicit path exceptions to override the stock path exceptions passed to the AIM plug-in.", async () => {
            // Arrange.
            const pathExceptions = ['/custom-path'];
            const fileExists = () => false;

            // Act.
            const plugin = (await pluginFactory(undefined, fileExists)(undefined, { pathExceptions }))[1];

            // Assert.
            expect(plugin).toBeTruthy();
            expect(mockedAimPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({ pathExceptions }));
        });
        it("Should allow an explicit import map to be passed to the AIM plug-in that overrides the default import map.", async () => {
            // Arrange.
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                },
                integrity: {}
            };
            const imOverride = {
                imports: {
                    '@x/y': 'z'
                },
                scopes: {
                    pickyModule: {
                        '@x/y': 'z'
                    }
                },
                integrity: {}
            };
            const readFile = (() => Promise.resolve(JSON.stringify(importMap))) as unknown as Parameters<typeof pluginFactory>[0];
            const fileExists = () => true;

            // Act.
            const plugin = (await pluginFactory(readFile, fileExists)(undefined, { importMap: imOverride }))[1];

            // Assert.
            expect(plugin).toBeTruthy();
            expect(mockedAimPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({ importMap: imOverride }));
        });
        it("Should allow passing AIM options via the first argument of the plug-in factory.", async () => {
            // Arrange.
            const aimOptions: CollageJsAimPluginOptions = { banner: false, allowedOrigins: ['https://example.com'] };
            const fileExists = () => false;

            // Act.
            const plugin = (await pluginFactory(undefined, fileExists)(aimOptions))[1];

            // Assert.
            expect(plugin).toBeTruthy();
            expect(mockedAimPlugin.mock.calls[0][0]).toEqual(expect.objectContaining(aimOptions));
        });
        it.each([
            {
                text: 'there is no import map',
                fileExists: false,
                options: { imo: true },
                shouldConfigure: true,
                confText: 'configure'
            },
            {
                text: 'there is no IMO script',
                fileExists: true,
                options: { imo: false },
                shouldConfigure: true,
                confText: 'configure'
            },
            {
                text: 'there is an import map and an IMO script',
                fileExists: true,
                options: { imo: true },
                shouldConfigure: false,
                confText: 'not configure'
            }
        ])("Should $confText AIM's 'shouldBlock' option to always return false if $text .", async ({ fileExists, options, shouldConfigure }) => {
            // Arrange.
            const fileExistsFn = () => fileExists;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
            };
            const readFile = (() => {
                return Promise.resolve(JSON.stringify(importMap));
            }) as unknown as Parameters<typeof pluginFactory>[0];

            // Act.
            const plugin = (await pluginFactory(readFile, fileExistsFn)(options))[1];

            // Assert.
            expect(plugin).toBeTruthy();
            const shouldBlockFn = mockedAimPlugin.mock.calls[0][0].shouldBlock;
            if (shouldConfigure) {
                expect(shouldBlockFn).toBeDefined();
                expect(shouldBlockFn()).toBe(false);
            }
            else {
                expect(shouldBlockFn).toBeUndefined();
            }
        });
    });
});

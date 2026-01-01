import { expect } from 'chai';
import { describe, it } from 'mocha';
import { pluginFactory } from '../src/plugin-factory.js';
import type { ConfigEnv, HtmlTagDescriptor, IndexHtmlTransformHook, MinimalPluginContextWithoutEnvironment, UserConfig } from 'vite';
import type { CollageJsImPluginOptions, ImoUiOption, ImoUiVariant, ImportMap, ImportMapsOption } from "../src/types.js";
import type { PathLike } from 'fs';

type ConfigHandler = (this: void, config: UserConfig, env: ConfigEnv) => Promise<UserConfig>

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
        const plugIn = pluginFactory(readPkgJsonFile)();
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
        const plugin = pluginFactory(readFile, fileExists)();
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        plugin.transformIndexHtml
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
        const plugin = pluginFactory(readFile, fileExists)();
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
            }
        };
        let fileRead = false;
        let fileReadCount = 0;
        const readFile = ((x: string) => {
            if (x === fileName) {
                fileRead = true;
            }
            ++fileReadCount;
            return Promise.resolve(JSON.stringify(importMap));
        }) as Parameters<typeof pluginFactory>[0];
        const plugin = pluginFactory(readFile, fileExists)();
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(fileRead).to.equal(true);
        expect(fileReadCount).to.equal(1);
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
            fileName: 'src/importMap.dev.json',
            viteCmd: 'serve'
        },
        {
            fileName: 'src/importMap.json',
            viteCmd: 'serve'
        },
        {
            fileName: 'src/importMap.json',
            viteCmd: 'build'
        }
    ];
    for (let tc of defaultImportMapTestData) {
        it(`Should pick the contents of the default file "${tc.fileName}" if the file exists on ${tc.viteCmd} as the contents of the import map script.`, () => defaultImportMapTest(tc.fileName, tc.viteCmd));
    }
    const importMapTest = async (propertyName: Exclude<keyof ImportMapsOption, 'type'>, viteCmd: ConfigEnv['command']) => {
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
            }
        };
        let fileRead = false;
        let fileReadCount = 0;
        const readFile = ((x: string) => {
            if (x === fileName) {
                fileRead = true;
            }
            ++fileReadCount;
            return Promise.resolve(JSON.stringify(importMap));
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { importMaps: {} };
        pluginOptions.importMaps![propertyName] = fileName;
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(fileRead).to.equal(true);
        expect(fileReadCount).to.equal(1);
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
    const importMapTestData: { propertyName: Exclude<keyof ImportMapsOption, 'type'>, viteCmd: ConfigEnv['command'] }[] = [
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
    const importMapTestMultiple = async (map1: ImportMap, map2: ImportMap, expectedMap: ImportMap, propertyName: Exclude<keyof ImportMapsOption, 'type'>, viteCmd: ConfigEnv['command']) => {
        // Arrange.
        const fileNames = ['A.json', 'B.json'];
        const fileExists = (x: PathLike) => fileNames.includes(x as string);
        const importMaps: Record<string, ImportMap> = {
            'A.json': map1,
            'B.json': map2
        };
        let fileRead: Record<string, boolean> = {};
        let fileReadCount = 0;
        const readFile = ((x: string) => {
            if (fileNames.includes(x)) {
                fileRead[x] = true;
            }
            ++fileReadCount;
            return Promise.resolve(JSON.stringify(importMaps[x]));
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { importMaps: {} };
        pluginOptions.importMaps![propertyName] = fileNames;
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(Object.keys(fileRead).length).to.equal(2);
        expect(fileReadCount).to.equal(2);
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
        propertyName: Exclude<keyof ImportMapsOption, 'type'>,
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
    const importMapTypeTest = async (importMapType: Exclude<ImportMapsOption['type'], undefined>, viteCmd: ConfigEnv['command']) => {
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
        pluginOptions.importMaps!.type = importMapType;
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
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
            expect(firstTag!.attrs!.type).to.equal(importMapType);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const importMapTypeTestData: Exclude<ImportMapsOption['type'], undefined>[] = [
        'importmap',
        'importmap-shim',
        'overridable-importmap',
        'systemjs-importmap'
    ];
    for (let cmd of viteCommands) {
        for (let t of importMapTypeTestData) {
            it(`Should set the import map type in the injected script tag to ${t} on ${cmd}.`, () => importMapTypeTest(t, cmd));
        }
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
        const plugin = pluginFactory(readFile, fileExists)();
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
        const plugin = pluginFactory(readFile, fileExists)();
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
        const plugin = pluginFactory(readFile, fileExists)();
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes('import-map-overrides@latest'));
            expect(imoTag).to.not.equal(undefined);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    for (let cmd of viteCommands) {
        it(`Should include a script tag for "import-map-overrides" if there are import maps and the "imo" configuration property is not specified on ${cmd}.`, () => imoOnImportMapTest(cmd));
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
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes(`import-map-overrides@${imoVersion}`));
            expect(imoTag).to.not.equal(undefined);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    for (let cmd of viteCommands) {
        it(`Should include a script tag for "import-map-overrides" using the version specified in the "imo" configuration property on ${cmd}.`, () => imoVersionTest(cmd));
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
        const imoUrl = 'https://cdn.example.com/import-map-overrides@3.0.1';
        const pluginOptions: CollageJsImPluginOptions = { imo: () => imoUrl };
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
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
        it(`Should include a script tag for "import-map-overrides" using the the URL returned by the function in the "imo" configuration property on ${cmd}.`, () => imoFunctionTest(cmd));
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
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes('import-map-overrides@latest'));
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
            it(`Should ${tc.includesOrNot}include the "import-map-overrides" tag if the "imo" configuration property is set to "${tc.imoValue}" on ${cmd}.`, () => imoBooleanTest(cmd, tc.imoValue));
        }
    }
    const noImoOnNoImportMapTest = async (viteCmd: ConfigEnv['command'], imoValue: CollageJsImPluginOptions['imo']) => {
        const fileExists = () => false;
        const readFile = (() => {
            throw new Error('Not implemented.');
        }) as Parameters<typeof pluginFactory>[0];
        const pluginOptions: CollageJsImPluginOptions = { imo: imoValue };
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
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
                        ((t.attrs!.src as string) ?? '').includes(`import-map-overrides@${imoValue}`) :
                        ((t.attrs!.src as string) ?? '').includes('import-map-overrides@latest')));
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
            imoValue: () => 'http://cdn.example.com/import-map-overrides@3.0.1',
            valueDesc: 'a function'
        }
    ];
    for (let tc of noImoOnNoImportMapTestData) {
        for (let cmd of viteCommands) {
            it(`Should not include "import-map-overrides" if no import map is available on ${cmd}, even if "imo" is set to ${tc.valueDesc} on ${cmd}.`, () => noImoOnNoImportMapTest(cmd, tc.imoValue));
        }
    }
    // const imoUiTest = async (viteCmd: ConfigEnv['command'], imoUiValue: CollageJsImPluginOptions['imoUi'], expectedToExist: boolean) => {
    //     const fileExists = () => true;
    //     const importMap = {
    //         imports: {
    //             '@a/b': 'cd'
    //         },
    //         scopes: {
    //             pickyModule: {
    //                 '@a/b': 'ef'
    //             }
    //         }
    //     };
    //     const readFile = () => {
    //         throw new Error('Not implemented.');
    //     };
    //     const pluginOptions: CollageJsImPluginOptions = { imoUi: imoUiValue };
    //     const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
    //     const env: ConfigEnv = { command: viteCmd, mode: 'development' };
    //     await (plugin.config as ConfigHandler)({}, env);
    //     const ctx = { path: '', filename: '' };

    //     // Act.
    //     const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

    //     // Assert.
    //     expect(xForm).to.not.equal(null);
    //     expect(xForm).to.not.equal(undefined);
    //     if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
    //         const imoTag = searchTag(xForm.tags, 'import-map-overrides-');
    //         const assertFn = expectedToExist ? () => expect(imoTag).to.not.equal(undefined) : () => expect(imoTag).to.equal(undefined);
    //         assertFn();
    //     }
    //     else {
    //         throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
    //     }
    // };
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
        const plugin = pluginFactory(readFile, fileExists)();
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
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
            it(`Should ${tc.text1}inlcude the "import-map-overrides" UI element when the "imoUi" property is not explicitly set on ${cmd} and there are ${tc.text2}import maps.`, () => imoUiDefaultsTest(cmd, tc.importMap));
        }
    }
    const imoUiIncludeTest = async (viteCmd: ConfigEnv['command'], imoUiOption: ImoUiVariant, variantName: string, expectToExist: boolean) => {
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
        const pluginOptions: CollageJsImPluginOptions = { imoUi: imoUiOption };
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, `import-map-overrides-${variantName}`);
            const assertFn = expectToExist ? () => expect(imoUiTag).to.not.equal(undefined) : () => expect(imoUiTag).to.equal(undefined);
            assertFn();
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const imoUiIncludeTestData: { imoUiOption: ImoUiVariant, variantName: string }[] = [
        {
            imoUiOption: true,
            variantName: 'full'
        }
    ];
    for (let cmd of viteCommands) {
        for (let tc of imoUiIncludeTestData) {
            it(`Should include the "import-map-overrides-${tc.variantName}" UI element when the "imoUi" property is set to ${tc.imoUiOption} on ${cmd}.`, () => imoUiIncludeTest(cmd, tc.imoUiOption, tc.variantName, true));
        }
    }
    for (let cmd of viteCommands) {
        it(`Should not include the "import-map-overrides" UI element when the "imoUi" property is set to false on ${cmd}.`, () => imoUiIncludeTest(cmd, false, '', false));
    }
    const imoUiNoAttrsTest = async (viteCmd: ConfigEnv['command'], imoUiOption: ImoUiVariant) => {
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
        const pluginOptions: CollageJsImPluginOptions = { imoUi: imoUiOption };
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, `import-map-overrides-${imoUiOption}`);
            expect(imoUiTag).to.not.equal(undefined);
            expect(Object.keys(imoUiTag?.attrs ?? {})).to.have.lengthOf(0);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const imoUiNoAttrsTestData: ImoUiVariant[] = [
        'list',
        'popup'
    ];
    for (let cmd of viteCommands) {
        for (let tc of imoUiNoAttrsTestData) {
            it(`Should not include any attributes in the "import-map-overrides" UI element when the UI variant is ${tc} on ${cmd}.`, () => imoUiNoAttrsTest(cmd, tc));
        }
    }
    const imoUiAttrsTest = async (viteCmd: ConfigEnv['command']) => {
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
        const pluginOptions: CollageJsImPluginOptions = { imoUi: 'full' };
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
            expect(imoUiTag).to.not.equal(undefined);
            expect(imoUiTag!.attrs!['trigger-position']).to.equal('bottom-right');
            expect(imoUiTag!.attrs!['show-when-local-storage']).to.equal('imo-ui');
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    for (let cmd of viteCommands) {
        it(`Should include the "trigger-position" and "show-when-local-storage" attributes in the "import-map-overrides-full" UI element with the defaults "bottom-right" and "imo-ui" on ${cmd}.`, () => imoUiAttrsTest(cmd));
    }
    const imoUiTriggerPosTest = async (viteCmd: ConfigEnv['command'], buttonPos: ImoUiOption['buttonPos']) => {
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
        const pluginOptions: CollageJsImPluginOptions = { imoUi: { buttonPos } };
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
            expect(imoUiTag).to.not.equal(undefined);
            expect(imoUiTag!.attrs!['trigger-position']).to.equal(buttonPos);
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    };
    const imoUiTriggerPosTestData: ImoUiOption['buttonPos'][] = [
        'bottom-left',
        'bottom-right',
        'top-left',
        'top-right'
    ];
    for (let cmd of viteCommands) {
        for (let tc of imoUiTriggerPosTestData) {
            it(`Should set the "trigger-position" attribute value to ${tc} when the "imoUi.buttonPos" property is set to ${tc} on ${cmd}.`, () => imoUiTriggerPosTest(cmd, tc));
        }
    }
    const imoUiLsKeyTest = async (viteCmd: ConfigEnv['command'], localStorageKey: ImoUiOption['localStorageKey'], expectAtt: boolean, expectedAttrValue: string | undefined) => {
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
        const pluginOptions: CollageJsImPluginOptions = { imoUi: {} };
        if (localStorageKey !== undefined) {
            (pluginOptions.imoUi as ImoUiOption).localStorageKey = localStorageKey;
        }
        const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
        const env: ConfigEnv = { command: viteCmd, mode: 'development' };
        await (plugin.config as ConfigHandler)({}, env);
        const ctx = { path: '', filename: '' };

        // Act.
        const xForm = await asHandlerDef(plugin.transformIndexHtml).handler('', ctx);

        // Assert.
        expect(xForm).to.not.equal(null);
        expect(xForm).to.not.equal(undefined);
        if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
            const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
            expect(imoUiTag).to.not.equal(undefined);
            if (expectAtt) {
                expect(imoUiTag!.attrs!['show-when-local-storage']).to.equal(expectedAttrValue);
            }
            else {
                expect(Object.keys(imoUiTag!.attrs!)).to.not.include('show-when-local-storage');
            }
        }
        else {
            throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
        }
    }
    for (let cmd of viteCommands) {
        [
            {
                localStorageKey: 'customLsValue',
                expectAtt: true,
                expectedAttrValue: 'customLsValue'
            },
            {
                localStorageKey: true as const,
                expectAtt: false,
                expectedAttrValue: undefined
            },
            {
                localStorageKey: undefined,
                expectAtt: true,
                expectedAttrValue: 'imo-ui'
            }
        ].forEach(tc => {
            it(`Should ${tc.expectAtt ? 'set' : 'not set'} the "show-when-local-storage" attribute value ${tc.expectAtt ? 'to "' + tc.expectedAttrValue + '"' : ''} when the "imoUi.localStorageKey" property is set to '${tc.localStorageKey}' on ${cmd}.`, () => imoUiLsKeyTest(cmd, tc.localStorageKey, tc.expectAtt, tc.expectedAttrValue));
        });
    }
});

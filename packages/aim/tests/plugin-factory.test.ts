import { describe, test, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from "vitest";
import { cjsAimPlugin, defaultImportMapEndpoint, importMapModuleName, pluginName, virtualizedImportMapModuleId } from "../src/plugin-factory";
import { createServer } from "vite";
import type { ConfigEnv, ResolvedConfig, ServerHook, ViteDevServer, Connect, PreviewServerHook } from "vite";
import type { ServerResponse } from "http";
import type { CollageJsAimPluginOptions } from "../src/types.js";
import type { PluginContext } from 'rolldown';
import { ImportMap } from "@collagejs/importmap";

type ViteConfigResolvedHookFn = (config: ResolvedConfig) => void | Promise<void>;

const externalizationModes: CollageJsAimPluginOptions['externalizationMode'][] = ['id', 'resolved'];

vi.mock("vite", async () => {
    const actual = await vi.importActual("vite");
    return {
        ...actual,
        createLogger: () => {
            return {
                error: vi.fn(),
                warn: vi.fn(),
                info: vi.fn(),
                success: vi.fn()
            };
        }
    };
});

vi.mock("@collagejs/shared", async () => {
    const actual = await vi.importActual("@collagejs/shared");
    return {
        ...actual,
        showCollageBanner: vi.fn(),
    };
});

describe("cjsAimPlugin", () => {
    test("Should create a plugin with the correct name.", () => {
        const plugin = cjsAimPlugin();
        expect(plugin.name).toBe(pluginName);
    });
    describe('configureServer', () => {
        let devServer: ViteDevServer;
        beforeAll(async () => {
            devServer = await createServer();
        });
        beforeEach(() => {
            // Clear any middleware.
            devServer.middlewares.stack = [];
        });
        const preparePlugin = async (pluginOptions?: CollageJsAimPluginOptions, base?: string) => {
            base ??= '/';
            const plugin = cjsAimPlugin(pluginOptions);
            await (plugin.configResolved as ViteConfigResolvedHookFn)({ base, command: "serve" } as ResolvedConfig);
            return plugin;
        };
        test("Should turn pre-transformation requests off.", async () => {
            devServer.environments.client.config.dev.preTransformRequests = true;
            const plugin = await preparePlugin();
            // @ts-expect-error TS2684
            await (plugin.configureServer as ServerHook)(devServer);
            expect(devServer.environments.client.config.dev.preTransformRequests).toBe(false);
        });
        test("Should add the import map reception middleware first.", async () => {
            const plugin = await preparePlugin();
            // @ts-expect-error TS2684
            await (plugin.configureServer as ServerHook)(devServer);
            expect(devServer.middlewares.stack.length).toBeGreaterThanOrEqual(1);
            expect(devServer.middlewares.stack[0].route).toBe(defaultImportMapEndpoint);
        });
        test("Should add the blocking middleware.", async () => {
            const plugin = await preparePlugin();
            // @ts-expect-error TS2684
            await (plugin.configureServer as ServerHook)(devServer);
            expect(devServer.middlewares.stack.length).toBeGreaterThan(1);
            expect(devServer.middlewares.stack.some(m => m.route === '')).toBe(true);
        });
        describe("Import Map Endpoint", () => {
            let handler: Connect.SimpleHandleFunction;
            beforeAll(async () => {
                devServer = await createServer();
                const plugin = await preparePlugin();
                // @ts-expect-error TS2684
                await (plugin.configureServer as ServerHook)(devServer);
                handler = devServer.middlewares.stack.find(m => m.route === defaultImportMapEndpoint)?.handle as Connect.SimpleHandleFunction;
            });
            test("Should correctly handle an OPTIONS request.", () => {
                const req: Connect.IncomingMessage = {
                    method: "OPTIONS",
                    url: defaultImportMapEndpoint
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(204, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
            });
            test.each([
                'GET',
                'PUT',
                'PATCH',
                'HEAD',
                'TRACE',
                'CONNECT',
            ])("Should return a 405 response for HTTP %s requests.", (method) => {
                const req: Connect.IncomingMessage = {
                    method,
                    url: defaultImportMapEndpoint
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(405, {
                    'Content-Type': 'application/json',
                    'Allow': 'POST, DELETE, OPTIONS',
                });
                expect(res.end).toHaveBeenCalledOnce();
            });
            test("Should return a 200 response for POST requests with a valid import map.", () => {
                const im = JSON.stringify({
                    imports: {
                        'abc': '/abs.js'
                    }
                });
                const req: Connect.IncomingMessage = {
                    method: "POST",
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://localhost'
                    },
                    on: (event: string, callback: (data?: string) => void) => {
                        if (event === 'data') {
                            callback(im);
                        }
                        else if (event === 'end') {
                            callback();
                        }
                    },
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                expect(res.end).toHaveBeenCalledOnce();
            });
            test("Should return a 400 response for POST requests with an import map incorrectly serialized.", () => {
                const im = JSON.stringify("{ imports: { } }");
                const req: Connect.IncomingMessage = {
                    method: "POST",
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://localhost'
                    },
                    on: (event: string, callback: (data?: string) => void) => {
                        if (event === 'data') {
                            callback(im);
                        }
                        else if (event === 'end') {
                            callback();
                        }
                    },
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(400, {
                    'Content-Type': 'application/json',
                });
                expect(res.end).toHaveBeenCalledOnce();
            });
            test("Should return a 400 response for POST requests with an invalid import map.", () => {
                const im = JSON.stringify('{ "import": { } }');
                const req: Connect.IncomingMessage = {
                    method: "POST",
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://localhost'
                    },
                    on: (event: string, callback: (data?: string) => void) => {
                        if (event === 'data') {
                            callback(im);
                        }
                        else if (event === 'end') {
                            callback();
                        }
                    },
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(400, {
                    'Content-Type': 'application/json',
                });
                expect(res.end).toHaveBeenCalledOnce();
            });
            test("Should return a 200 response for DELETE requests.", () => {
                const req: Connect.IncomingMessage = {
                    method: "DELETE",
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://localhost'
                    }
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(200, {
                    'Content-Type': 'application/json',
                });
                expect(res.end).toHaveBeenCalledOnce();
                expect(JSON.parse((res.end as unknown as Mock).mock.calls[0][0])).toEqual({
                    success: true,
                    externalizedModulesDeleted: expect.any(Number)
                });
            });
            test.each([
                'POST',
                'DELETE',
            ])("Should return a 403 response for %s requests from unauthorized origins.", (method) => {
                const im = JSON.stringify({
                    imports: { }
                });
                const req: Connect.IncomingMessage = {
                    method,
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://unauthorized.com'
                    },
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(im);
                        }
                        else if (event === 'end') {
                            callback();
                        }
                    }),
                } as unknown as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                handler(req, res);
                expect(res.writeHead).toHaveBeenCalledWith(403, {
                    'Content-Type': 'application/json',
                });
                expect(res.end).toHaveBeenCalledOnce();
            });
        });
        describe("Blocking Middleware", () => {
            let handler: Connect.NextHandleFunction;
            let imHandler: Connect.SimpleHandleFunction;
            const pathEx = '/let/me/pass';
            beforeAll(async () => {
                devServer = await createServer();
                const plugin = await preparePlugin({ importMapTimeout: 0, pathExceptions: [pathEx] });
                // @ts-expect-error TS2684
                await (plugin.configureServer as ServerHook)(devServer);
                // @ts-expect-error
                handler = devServer.middlewares.stack.find(m => m.handle.name === '' && m.route === '')?.handle as Connect.NextHandleFunction;
                imHandler = devServer.middlewares.stack.find(m => m.route === defaultImportMapEndpoint)?.handle as Connect.SimpleHandleFunction;
            });
            const res = {
                statusCode: 0,
            } as unknown as ServerResponse;
            test.each([
                'POST',
                'PUT',
                'PATCH',
                'DELETE',
                'HEAD',
                'OPTIONS',
                'TRACE',
                'CONNECT'
            ] as const)("Should not block HTTP %s requests.", (method) => {
                const req: Connect.IncomingMessage = {
                    method,
                    url: '/a.js'
                } as Connect.IncomingMessage;
                const next = vi.fn();
                handler(req, res, next);
                expect(next).toHaveBeenCalledOnce();
            });
            test("Should block HTTP GET requests.", async () => {
                const req: Connect.IncomingMessage = {
                    method: 'GET',
                    url: '/a.js'
                } as Connect.IncomingMessage;
                const next = vi.fn();
                const p = handler(req, res, next);
                expect(next).not.toHaveBeenCalled();
                await p;
                expect(next).toHaveBeenCalledOnce();
            });
            test.each([
                '/@vite/client'
            ])("Should not block stock exception %s.", (ex) => {
                const req: Connect.IncomingMessage = {
                    method: 'GET',
                    url: ex
                } as Connect.IncomingMessage;
                const next = vi.fn();
                handler(req, res, next);
                expect(next).toHaveBeenCalledOnce();
            });
            test("Should not block user exceptions.", () => {
                const req: Connect.IncomingMessage = {
                    method: 'GET',
                    url: pathEx
                } as Connect.IncomingMessage;
                const next = vi.fn();
                handler(req, res, next);
                expect(next).toHaveBeenCalledOnce();
            });
            const postImportMap = async () => {
                const data = JSON.stringify({
                    imports: {
                        '@bare/id': '/a/b/c.js'
                    }
                });
                const req: Connect.IncomingMessage = {
                    method: "POST",
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://localhost'
                    },
                    on: (event: string, callback: (data?: string) => void) => {
                        if (event === 'data') {
                            callback(data);
                        }
                        else if (event === 'end') {
                            callback();
                        }
                    },
                } as Connect.IncomingMessage;
                const res = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                await imHandler(req, res);
            }
            test("Should unblock blocked requests once the import map data is received.", async () => {
                const req: Connect.IncomingMessage = {
                    method: 'GET',
                    url: 'some/code.js'
                } as Connect.IncomingMessage;
                const next = vi.fn();
                const p = handler(req, res, next);
                expect(next).not.toHaveBeenCalled();
                await postImportMap()
                await p;
                expect(next).toHaveBeenCalledOnce();
            });
            test("Should not block requests if the import map data is readily available.", async () => {
                await postImportMap();
                const req: Connect.IncomingMessage = {
                    method: 'GET',
                    url: 'some/code.js'
                } as Connect.IncomingMessage;
                const next = vi.fn();
                handler(req, res, next);
                expect(next).toHaveBeenCalledOnce();
            });
            test("Should go back to blocking requests if the import map is deleted.", async () => {
                await postImportMap();
                const req1: Connect.IncomingMessage = {
                    method: 'GET',
                    url: 'some/code.js'
                } as Connect.IncomingMessage;
                const next1 = vi.fn();
                const p1 = handler(req1, res, next1);
                expect(next1).toHaveBeenCalledOnce();
                await p1;
                const deleteReq: Connect.IncomingMessage = {
                    method: 'DELETE',
                    url: defaultImportMapEndpoint,
                    headers: {
                        origin: 'http://localhost'
                    },
                } as Connect.IncomingMessage;
                const deleteRes = {
                    statusCode: 0,
                    writeHead: vi.fn(),
                    end: vi.fn()
                } as unknown as ServerResponse;
                await imHandler(deleteReq, deleteRes);
                expect(deleteRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
                const req2: Connect.IncomingMessage = {
                    method: 'GET',
                    url: 'some/code.js'
                } as Connect.IncomingMessage;
                const next2 = vi.fn();
                const p2 = handler(req2, res, next2);
                expect(next2).not.toHaveBeenCalled();
                await p2;
                expect(next2).toHaveBeenCalledOnce();
            });
            describe('shouldBlock', async () => {
                const shouldBlockFn = vi.fn();
                beforeAll(async () => {
                    devServer = await createServer();
                    const plugin = await preparePlugin({ importMapTimeout: 150, pathExceptions: [pathEx], shouldBlock: shouldBlockFn });
                    // @ts-expect-error TS2684
                    await(plugin.configureServer as ServerHook)(devServer);
                    // @ts-expect-error
                    handler = devServer.middlewares.stack.find(m => m.handle.name === '' && m.route === '')?.handle as Connect.NextHandleFunction;
                });
                afterEach(() => {
                    shouldBlockFn.mockReset();
                });
                test("Should use the 'shouldBlock' option if provided.", async () => {
                    const req: Connect.IncomingMessage = {
                        method: 'GET',
                        url: 'some/code.js'
                    } as Connect.IncomingMessage;
                    shouldBlockFn.mockReturnValue(false);
                    const next = vi.fn();
                    handler(req, res, next);
                    expect(shouldBlockFn).toHaveBeenCalledOnce();
                    expect(shouldBlockFn).toHaveBeenCalledWith(req, expect.any(Function));
                });
                test("Should block the request if 'shouldBlock' returns true.", async () => {
                    const req: Connect.IncomingMessage = {
                        method: 'GET',
                        url: 'some/code.js'
                    } as Connect.IncomingMessage;
                    shouldBlockFn.mockReturnValue(true);
                    const next = vi.fn();
                    const p = handler(req, res, next);
                    expect(next).not.toHaveBeenCalled();
                    await p;
                    expect(next).toHaveBeenCalledOnce();
                });
                test("Should not block the request if 'shouldBlock' returns false.", async () => {
                    const req: Connect.IncomingMessage = {
                        method: 'GET',
                        url: 'some/code.js'
                    } as Connect.IncomingMessage;
                    shouldBlockFn.mockReturnValue(false);
                    const next = vi.fn();
                    handler(req, res, next);
                    expect(next).toHaveBeenCalledOnce();
                });
                test("Should give the stock predicate function to 'shouldBlock' as the second argument.", async () => {
                    const req: Connect.IncomingMessage = {
                        method: 'GET',
                        url: 'some/code.js'
                    } as Connect.IncomingMessage;
                    shouldBlockFn.mockReturnValue(false);
                    const next = vi.fn();
                    handler(req, res, next);
                    expect(shouldBlockFn).toHaveBeenCalledOnce();
                    const stockPredicate = shouldBlockFn.mock.calls[0][1];
                    expect(typeof stockPredicate).toBe('function');
                });
            });
        });
        externalizationModes.forEach(mode => {
            describe(`Module Resolution (externalizationMode: '${mode}')`, () => {
                let handler: Connect.SimpleHandleFunction;
                let plugin: Awaited<ReturnType<typeof preparePlugin>>;
                beforeAll(async () => {
                    devServer = await createServer();
                    plugin = await preparePlugin({ externalizationMode: mode });
                    await plugin.configureServer.bind({} as PluginContext)(devServer);
                    handler = devServer.middlewares.stack.find(m => m.route === defaultImportMapEndpoint)?.handle as Connect.SimpleHandleFunction;
                });
                test.each([
                    {
                        text: "resolve",
                        id: 'abc',
                        expected: { id: '/abs.js', external: true }
                    },
                    {
                        text: "not resolve",
                        id: '/@vite/client',
                        expected: null
                    },
                    {
                        text: "not resolve",
                        id: '/@vite/env',
                        expected: null
                    },
                    {
                        text: "not resolve",
                        id: 'http://example.com',
                        expected: null
                    },
                    {
                        text: "not resolve",
                        id: 'http://example.com/abc',
                        expected: null
                    },
                    {
                        text: "not resolve",
                        id: './ab/cd',
                        expected: null
                    },
                    {
                        text: "not resolve",
                        id: '@bare/id',
                        expected: null
                    },
                ])(`Should $text identifier $id under the '${mode}' externalization mode.`, async ({ id, expected }) => {
                    const im = JSON.stringify({
                        imports: {
                            'abc': '/abs.js'
                        }
                    });
                    const req: Connect.IncomingMessage = {
                        method: "POST",
                        url: defaultImportMapEndpoint,
                        headers: {
                            origin: 'http://localhost'
                        },
                        on: (event: string, callback: (data?: string) => void) => {
                            if (event === 'data') {
                                callback(im);
                            }
                            else if (event === 'end') {
                                callback();
                            }
                        },
                    } as Connect.IncomingMessage;
                    const res = {
                        statusCode: 0,
                        writeHead: vi.fn(),
                        end: vi.fn()
                    } as unknown as ServerResponse;
                    handler(req, res);
                    expect(res.writeHead).toHaveBeenCalledWith(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    });
                    expect(res.end).toHaveBeenCalledOnce();
                    const resolved = await plugin.resolveId.handler.bind({} as PluginContext)(id, undefined);
                    expect(resolved).toEqual(expected);
                });
            });
        });
    });
    externalizationModes.forEach(mode => {
        describe(`resolveId (externalizationMode: '${mode}')`, () => {
            test.each<{
                viteCmd: ConfigEnv["command"];
                text: string;
                expected: { id: string; external: true } | null;
            }>([
                {
                    viteCmd: "serve",
                    text: "not externalize",
                    expected: null
                },
                {
                    viteCmd: "build",
                    text: "externalize",
                    expected: { id: '/foo.js', external: true }
                }
            ])(`Should $text module identifiers that are defined in the 'importMap' option while '${mode}' externalization mode and Vite's $viteCmd mode.`, async ({ viteCmd, expected }) => {
                const plugin = cjsAimPlugin({ importMap: { imports: { 'foo': '/foo.js' } }, externalizationMode: mode });
                await plugin.configResolved.bind({} as PluginContext)({ command: viteCmd } as ResolvedConfig);
                const resolved = await (plugin.resolveId.handler.bind({} as PluginContext))('foo', undefined);
                if (expected && mode === 'id') {
                    expected.id = 'foo';
                }
                expect(resolved).toEqual(expected);
            });
            test(`Should externalize by returning the ${mode === 'id' ? 'same ID' : 'resolved ID'} while in '${mode}' externalization mode and Vite's build mode.`, async () => {
                const plugin = cjsAimPlugin({ importMap: { imports: { 'foo': '/foo.js' } }, externalizationMode: mode });
                await plugin.configResolved.bind({} as PluginContext)({ command: 'build' } as ResolvedConfig);
                const resolved = await (plugin.resolveId.handler.bind({} as PluginContext))('foo', undefined);
                if (mode === 'id') {
                    expect(resolved).toEqual({ id: 'foo', external: true });
                }
                else {
                    expect(resolved).toEqual({ id: '/foo.js', external: true });
                }
            });
        });
    });
    describe('configurePreviewServer', () => { 
        test("Should return 204 for OPTIONS requests.", async () => {
            const plugin = cjsAimPlugin();
            await (plugin.configResolved as ViteConfigResolvedHookFn)({ command: 'serve' } as ResolvedConfig);
            const req: Connect.IncomingMessage = {
                method: "OPTIONS",
                url: defaultImportMapEndpoint
            } as Connect.IncomingMessage;
            const res = {
                statusCode: 0,
                writeHead: vi.fn(),
                end: vi.fn()
            } as unknown as ServerResponse;
            let endpoint: string;
            let handler: Connect.SimpleHandleFunction;
            const previewServer = {
                middlewares: {
                    use: (ep: string, h: Connect.SimpleHandleFunction) => {
                        endpoint = ep;
                        handler = h;
                    }
                }
            };
            // @ts-expect-error TS2684 We don't care about the "this" object.
            await (plugin.configurePreviewServer as PreviewServerHook)(previewServer);
            handler!(req, res);
            expect(endpoint!).toBe(defaultImportMapEndpoint);
            expect(res.writeHead).toHaveBeenCalledWith(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
        });
        test.each([
            'POST',
            'DELETE',
            'GET',
            'PUT',
            'PATCH',
            'HEAD',
            'TRACE',
            'CONNECT'
        ])("Should return 204 for %s requests.", async (method) => {
            const plugin = cjsAimPlugin();
            await (plugin.configResolved as ViteConfigResolvedHookFn)({ command: 'serve' } as ResolvedConfig);
            const req: Connect.IncomingMessage = {
                method,
                url: defaultImportMapEndpoint
            } as Connect.IncomingMessage;
            const res = {
                statusCode: 0,
                writeHead: vi.fn(),
                end: vi.fn()
            } as unknown as ServerResponse;
            let endpoint: string;
            let handler: Connect.SimpleHandleFunction;
            const previewServer = {
                middlewares: {
                    use: (ep: string, h: Connect.SimpleHandleFunction) => {
                        endpoint = ep;
                        handler = h;
                    }
                }
            };
            // @ts-expect-error TS2684 We don't care about the "this" object.
            await (plugin.configurePreviewServer as PreviewServerHook)(previewServer);
            handler!(req, res);
            expect(endpoint!).toBe(defaultImportMapEndpoint);
            expect(res.writeHead).toHaveBeenCalledWith(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
        });
    });
    [
        'serve' as const,
        'build' as const
    ].forEach(viteCmd => {
        const testPrefix = `${viteCmd}: `;
        describe(`Virtual Import Map Module (${viteCmd} mode)`, () => {
            test(`${testPrefix}Should resolve the virtual import map module ID.`, async () => {
                const plugin = cjsAimPlugin();
                await plugin.configResolved.bind({} as PluginContext)({ command: viteCmd } as ResolvedConfig);
                const resolved = await plugin.resolveId.handler.bind({} as PluginContext)(importMapModuleName, undefined);
                expect(resolved).toEqual(virtualizedImportMapModuleId);
            });
            test(`${testPrefix}Should return a module that exports 'undefined' when no import map is available.`, async () => {
                const plugin = cjsAimPlugin();
                await plugin.configResolved.bind({} as PluginContext)({ command: viteCmd } as ResolvedConfig);
                const loadResult = await plugin.load.bind({} as PluginContext)(virtualizedImportMapModuleId);
                const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
                eval(loadResult?.code.replace('export const importMap =', 'console.log(') + ')');
                expect(consoleLogSpy).toHaveBeenCalledWith(undefined);
                consoleLogSpy.mockRestore();
            });
            if (viteCmd === 'build') {
                test(`${testPrefix}Should return a module that exports the import map when an import map is available.`, async () => {
                    const im = { imports: { 'abc': '/abs.js' } } satisfies ImportMap;
                    const plugin = cjsAimPlugin({ importMap: im });
                    await plugin.configResolved.bind({} as PluginContext)({ command: viteCmd } as ResolvedConfig);
                    const loadResult = await plugin.load.bind({} as PluginContext)(virtualizedImportMapModuleId);
                    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
                    eval(loadResult?.code.replace('export const importMap =', 'console.log(') + ')');
                    expect(consoleLogSpy).toHaveBeenCalledWith(im);
                    consoleLogSpy.mockRestore();
                });
            }
            else {
                test(`${testPrefix}Should return a module that exports the import map when an import map is available.`, async () => {
                    const im = { imports: { 'abc': '/sba.js' } } satisfies ImportMap;
                    const req: Connect.IncomingMessage = {
                        method: "POST",
                        url: defaultImportMapEndpoint,
                        headers: {
                            origin: 'http://localhost'
                        },
                        on: (event: string, callback: (data?: string) => void) => {
                            if (event === 'data') {
                                callback(JSON.stringify(im));
                            }
                            else if (event === 'end') {
                                callback();
                            }
                    },
                    } as Connect.IncomingMessage;
                    const res = {
                        statusCode: 0,
                        writeHead: vi.fn(),
                        end: vi.fn()
                    } as unknown as ServerResponse;
                    let handler: Connect.SimpleHandleFunction;
                    const devServer = await createServer();
                    const preparePlugin = async (pluginOptions?: CollageJsAimPluginOptions, base?: string) => {
                        base ??= '/';
                        const plugin = cjsAimPlugin(pluginOptions);
                        await (plugin.configResolved as ViteConfigResolvedHookFn)({ base, command: "serve" } as ResolvedConfig);
                        return plugin;
                    };
                    const plugin = await preparePlugin();
                    await plugin.configureServer.bind({} as PluginContext)(devServer);
                    handler = devServer.middlewares.stack.find(m => m.route === defaultImportMapEndpoint)?.handle as Connect.SimpleHandleFunction;
                    handler!(req, res);
                    const loadResult = await plugin.load.bind({} as PluginContext)(virtualizedImportMapModuleId);
                    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
                    eval(loadResult?.code.replace('export const importMap =', 'console.log(') + ')');
                    expect(consoleLogSpy).toHaveBeenCalledWith(im);
                    consoleLogSpy.mockRestore();
                });
            }
        });
    });
});

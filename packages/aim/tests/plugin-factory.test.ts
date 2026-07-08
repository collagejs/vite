import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { cjsAimPlugin, defaultImportMapEndpoint, pluginName } from "../src/plugin-factory";
import { createServer } from "vite";
import type { ConfigEnv, ResolvedConfig, ServerHook, ViteDevServer, Connect } from "vite";
import type { ServerResponse } from "http";
import { CollageJsAimPluginOptions } from "../src";

type ViteConfigResolvedHookFn = (config: ResolvedConfig) => void | Promise<void>;
type ViteResolveIdHookFn = (id: string, importer?: string, options?: { ssr?: boolean }) => Promise<{ id: string; external: true } | null | undefined>;

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
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
            });
            test("Should return a 405 response for HTTP requests that are not OPTIONS or POST.", () => {
                const req: Connect.IncomingMessage = {
                    method: "GET",
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
                    'Allow': 'POST, OPTIONS',
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
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
        });
        describe("Blocking Middleware", () => {
            let handler: Connect.NextHandleFunction;
            let imHandler: Connect.SimpleHandleFunction;
            const pathEx = '/let/me/pass';
            beforeAll(async () => {
                devServer = await createServer();
                const plugin = await preparePlugin({ importMapTimeout: 150, pathExceptions: [pathEx] });
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
        describe("Module Resolution", () => {
            let handler: Connect.SimpleHandleFunction;
            let plugin: Awaited<ReturnType<typeof preparePlugin>>;
            beforeAll(async () => {
                devServer = await createServer();
                plugin = await preparePlugin();
                // @ts-expect-error TS2684
                await (plugin.configureServer as ServerHook)(devServer);
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
            ])("Should $text identifier $id .", async ({ id, expected }) => {
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
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                expect(res.end).toHaveBeenCalledOnce();
                const resolved = await (plugin.resolveId as ViteResolveIdHookFn)(id, undefined, { ssr: false });
                expect(resolved).toEqual(expected);
            });
        });
    });
    describe("resolveId", () => {
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
        ])("Should $text module identifiers that are defined in the 'importMap' option while in $viteCmd mode.", async ({ viteCmd, expected }) => {
            const plugin = cjsAimPlugin({ importMap: { imports: { 'foo': '/foo.js' } } });
            await (plugin.configResolved as ViteConfigResolvedHookFn)({ command: viteCmd } as ResolvedConfig);
            const resolved = await (plugin.resolveId as ViteResolveIdHookFn)('foo', undefined, { ssr: false });
            expect(resolved).toEqual(expected);
        });
    });
});

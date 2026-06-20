import { describe, test, expect, vi, beforeAll, beforeEach } from "vitest";
import type { ExternalOption } from "rollup";
import { cjsAimPlugin, defaultImportMapEndpoint, mergeExternalOptions, pluginName } from "../src/plugin-factory";
import { createServer } from "vite";
import type { ConfigEnv, ResolvedConfig, ServerHook, UserConfig, ViteDevServer, Connect } from "vite";
import type { ServerResponse } from "http";
import { PluginOptions } from "../src";

type ViteConfigHookFn = (config: UserConfig, env: ConfigEnv) => Omit<UserConfig, "plugins">;
type ViteConfigResolvedHookFn = (config: ResolvedConfig) => void | Promise<void>;

describe("mergeExternalOptions", () => {
    test.each<{
        externals: ExternalOption;
        text: string;
        verifications: {
            input: string;
            expected: boolean;
        }[];
    }>([
        {
            externals: [],
            text: "empty externals",
            verifications: [
                {
                    input: "foo",
                    expected: false
                }
            ]
        },
        {
            externals: ["foo", "bar"],
            text: "string externals",
            verifications: [
                {
                    input: "foo",
                    expected: true
                },
                {
                    input: "baz",
                    expected: false
                }
            ]
        },
        {
            externals: [/^foo$/, /^bar$/],
            text: "regex externals",
            verifications: [
                {
                    input: "foo",
                    expected: true
                },
                {
                    input: "bar",
                    expected: true
                },
                {
                    input: "baz",
                    expected: false
                }
            ]
        },
        {
            externals: ["foo", /^bar$/],
            text: "mixed externals",
            verifications: [
                {
                    input: "foo",
                    expected: true
                },
                {
                    input: "bar",
                    expected: true
                },
                {
                    input: "baz",
                    expected: false
                }
            ]
        },
        {
            externals: (id) => id === "foo",
            text: "function externals",
            verifications: [
                {
                    input: "foo",
                    expected: true
                },
                {
                    input: "bar",
                    expected: false
                }
            ]
        }
    ])("Should correctly merge $text .", ({ externals, verifications }) => {
        const merged = mergeExternalOptions(externals) as (id: string) => boolean;
        for (const { input, expected } of verifications) {
            expect(merged(input)).toBe(expected);
        }
    });
    test("Should pass source, importer and isResolved arguments to function externals.", () => {
        const mockFn = vi.fn().mockReturnValue(false);
        const merged = mergeExternalOptions(mockFn) as (id: string, importer?: string, isResolved?: boolean) => boolean;
        merged("foo", "importer.js", true);
        expect(mockFn).toHaveBeenCalledWith("foo", "importer.js", true);
    });
    test("Should return the return value of the function externals.", () => {
        const mockFn = vi.fn().mockReturnValue(true);
        const merged = mergeExternalOptions(mockFn) as (id: string) => boolean;
        expect(merged("foo")).toBe(true);
    });
});

describe("cjsAimPlugin", () => {
    test("Should create a plugin with the correct name.", () => {
        const plugin = cjsAimPlugin();
        expect(plugin.name).toBe(pluginName);
    });
    test("Should not touch Vite's configuration when Vite runs in serve mode.", async () => {
        const plugin = cjsAimPlugin();
        const config: UserConfig = {};
        await (plugin.config as ViteConfigHookFn)(config, { command: "serve", mode: "development" });
        expect(config).toEqual({});
    });
    test("Should merge external options into Vite's configuration when Vite runs in build mode.", async () => {
        const plugin = cjsAimPlugin({
            externals: ["foo", /^bar$/]
        });
        const config: UserConfig = {};
        await (plugin.config as ViteConfigHookFn)(config, { command: "build", mode: "development" });
        expect(config).toEqual({
            build: {
                rollupOptions: {
                    external: ["foo", /^bar$/]
                }
            }
        });
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
        const preparePlugin = async (pluginOptions?: PluginOptions, base?: string) => {
            base ??= '/';
            const plugin = cjsAimPlugin(pluginOptions);
            await (plugin.config as ViteConfigHookFn)({}, { command: "serve", mode: "development" });
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
        });
    });
});

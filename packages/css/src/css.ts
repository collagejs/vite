import { AcceptableTarget, CorePiece, RelocateFn } from "@collagejs/core";
import { CountControlledData } from "./CountControlledData.js";
import { createLinkElement, defaultFactoryOptions, LinkLoadResult, processCssPromises, wireCssLinkElement } from "./css-helpers.js";
import { CssFactoryOptions } from "./ex-types.js";
import { getLogger } from "./logger.js";
import { CssMap, CssRecord, RelocateContext } from "./private-types.js";
import { cssInjectedMap } from "./injected-map.js";

/**
 * Head element mutation observer used to track CSS that Vite has scheduled for dynamic injection.  This commonly 
 * happens when importing ES modules dynamically.  If the dynamically-imported module imports CSS, then that CSS will 
 * be compiled into a separate CSS asset file and the dynamic chunk will have code to inject it when the module is 
 * loaded.
 */
let observer: MutationObserver | undefined;
/**
 * Unique identifier injected to every generated CSS file during the build (bundling) process.  Only CSS links with 
 * URL's containing this identifier will be tracked for enabling/disabling based on the *CollageJS* pieces mounted in 
 * light DOM.
 */
const projectId = '{cjcss:PROJECT_ID}';
/**
 * The "live" CSS map that is derived from the injected map.
 */
const cssMap: CssMap = JSON.parse(cssInjectedMap);
/**
 * Map of all CSS files that are statically mounted in light DOM per entry name.  Different entries may share the same 
 * CSS file, so this map is used to track the number of CollageJS pieces mounted in light DOM that depend on a given
 * CSS file.  When the count reaches zero, the CSS file is disabled in the HEAD element.
 */
const cssFileCounts: Record<string, CountControlledData<HTMLLinkElement>> = {};
/**
 * Dictionary object directly derived from the injected CSS map that sets up counters for CollageJS piece instances 
 * mounted in light DOM for each entry point.  The counters are used to determine if the dynamic CSS files associated 
 * with each entry point should be enabled or disabled in the HEAD element.
 */
const entryCounts = Object.keys(cssMap).reduce((acc, key) => {
    acc[key] = new CountControlledData([] as HTMLLinkElement[], {
        onCountExhausted: (controller) => {
            for (let css of controller.data) {
                css.disabled = !isDynCssInUse(css.dataset.mapKey!);
            }
        },
        onCountRestarted: (controller) => {
            for (let css of controller.data) {
                css.disabled = false;
            }
        },
    });
    return acc;
}, {} as Record<string, CountControlledData<HTMLLinkElement[]>>);
/**
 * Reverse map of the injected CSS map that allows for looking up the entry points that depend on a given dynamic CSS 
 * file.  This is used to determine if a dynamic CSS file should be enabled or disabled in the HEAD element based on 
 * the CollageJS pieces currently mounted in light DOM.
 */
const dynCssMap: Record<string, string[]> = Object.keys(cssMap).reduce((acc, key) => {
    const dynCss = cssMap[key]!.dynamic;
    for (let css of dynCss) {
        if (!acc[css]) {
            acc[css] = [];
        }
        acc[css].push(key);
    }
    return acc;
}, {} as Record<string, string[]>);
/**
 * Determines if the given CSS file is currently in use by at least one CollageJS piece mounted in light DOM.
 * 
 * The function looks up the entry names that depend on the CSS file, and checks if any of them have a non-zero count
 * of CollageJS pieces mounted in light DOM.
 * @param cssFileName CSS file name whose data is wanted. **Does not contain any base, and is the asset name given by Vite**.
 * @returns `true` if at least one entry reports at least one CollageJS piece mounted in light DOM that depends on the
 * CSS file; `false` otherwise.
 */
function isDynCssInUse(cssFileName: string) {
    const entryNames = dynCssMap[cssFileName];
    if (!entryNames) {
        return false;
    }
    return entryNames.some((entryName) => !!entryCounts[entryName]?.count);
}
/**
 * Processes the newly inserted LINK element in HEAD (using the head observer) and determines if should or should not 
 * become disabled.
 * 
 * It looks up the entry points that depend on the CSS injected by the LINK element, and disables it immediately if 
 * there are no CollageJS pieces currently mounted in light DOM that depend on said CSS.  This would mean that the 
 * LINK element was triggered by a CollageJS piece that has been mounted in shadow DOM.
 * 
 * If there are active CollageJS pieces in light DOM that depend on the CSS injected by the LINK element, then the LINK
 * element is left enabled, and will be disabled when the last CollageJS piece that depends on it is unmounted, again, 
 * in light DOM.
 * @param link HTML link element provided by the mutation observer.
 */
function processDynamicCssFile(link: HTMLLinkElement) {
    const logger = getLogger();
    let cssFileName: string | undefined;
    for (let key in dynCssMap) {
        if (link.href.endsWith(key)) {
            cssFileName = key;
            break;
        }
    }
    if (!cssFileName) {
        // This should never happen, but if it does, it is a CSS file that does have the project ID in its name, but
        // is not registered under any entry file name.  It is best to just leave it alone.  If people complain, then 
        // the issue can be investigated further, but for now, it is best to just ignore it.
        logger.debug('A CSS file that matched the project ID "%s" criterion was injected into HEAD, but it is not registered under any entry.  Leaving it enabled and untracked.  File: %s', projectId, link.href);
        return;
    }
    link.dataset.mapKey = cssFileName;
    const entryNames = dynCssMap[cssFileName]!;
    logger.debug('CSS file with HREF "%s" was injected into HEAD.  It is registered under the following entries: %s', link.href, entryNames.join(', '));
    for (let entryName of entryNames) {
        entryCounts[entryName]?.data.push(link);
    }
    // If coming from shadow DOM, there's a chance it is not needed, so disable immediately.
    // It will be re-enabled if a CollageJS piece that depends on it is mounted in light DOM.
    if (!isDynCssInUse(cssFileName)) {
        link.disabled = true;
        logger.debug('CSS file with HREF "%s" is not needed by any CollageJS pieces mounted in light DOM.  Disabling it.', link.href);
        return;
    }
    logger.debug('CSS file with HREF "%s" is needed by at least one CollageJS piece mounted in light DOM.  Leaving it enabled.', link.href);
}
/**
 * Determines if the given HTML node is a LINK element.
 * @param el HTML node to test.
 * @returns 
 */
function isLinkElement(el: Node): el is HTMLLinkElement {
    return el.nodeName === 'LINK';
}
/**
 * Starts an observation process to identify any CSS link elements that Vite's CSS splitting algorithm may auto-insert.
 * @returns The observer object that can be used to stop the observation process.
 */
function observeHead() {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.addedNodes.length > 0) {
                m.addedNodes.forEach(an => {
                    if (isLinkElement(an) && an.rel === 'stylesheet' && an.href.includes(`cjcss(${projectId})`) && !an.getAttribute('data-cjcss')) {
                        processDynamicCssFile(an);
                    }
                });
            }
        });
    });
    observer.observe(globalThis?.document?.head, {
        childList: true
    });
    return observer;
}
/**
 * Mounts the specified CSS filename as a CSS link element in the HEAD element.  The function returns a promise that 
 * resolves once the load event of the LINK element fires.
 * @param cssFileName The CSS filename to be mounted.
 */
function mountCssFile(cssFileName: string, linkEl: HTMLLinkElement, addFouc: boolean, loadTimeout: number, target: AcceptableTarget, isShadowRoot: boolean) {
    return new Promise<LinkLoadResult>((rslv, _rjct) => {
        if (!linkEl.isConnected) {
            target[isShadowRoot ? 'prepend' : 'appendChild'](linkEl);
        }
        if (!addFouc) {
            rslv({ status: 'ok' });
            return;
        }
        rslv(wireCssLinkElement(linkEl, cssFileName, projectId, loadTimeout));
    });
}
/**
 * Regular expression used to extract the last segment of a URL that ends with ".js" and may have query parameters or 
 * hash fragments.
 * 
 * It is also used to replace it and generate the base URL for the CSS files.
 */
const lastSegmentRegex = /\/([^/]+)\.js([#?].*$|$)/;
/**
 * Class that implements a factory of CollageJS lifecycle functions for a given entry file.
 */
export class CssFactory {
    /**
     * Base URL used to resolve the CSS file names.  This is derived from the Vite environment variable `BASE_URL` and
     * can be overridden by the constructor parameter `baseUrl`.
     */
    #baseUrl = import.meta.env.BASE_URL;
    /**
     * The CSS record for the entry file.  This is derived from the injected CSS map.
     */
    #cssRecord: CssRecord;
    /**
     * The options used to configure the factory.  This is derived from the default options and can be overridden by
     * the constructor parameter `options`.
     */
    #options: Required<CssFactoryOptions>;
    /**
     * The entry file name for which the factory is created.  This is used to look up the CSS record in the injected 
     * CSS map.
     */
    #entry: string;
    #logger = getLogger();
    /**
     * Initializes a new instance of this class.
     * @param moduleUrl The URL of the module for which the factory is created.  Always use `import.meta.url` for this
     * parameter unless you have a very specific edge case where it doesn't work.
     * @param options Optional set of options for the CSS algorithm.
     */
    constructor(moduleUrl: string, options?: CssFactoryOptions) {
        this.#logger.debug('Initializing CssFactory for module URL: %s', moduleUrl);
        this.#baseUrl = moduleUrl.replace(lastSegmentRegex, '/');
        this.#logger.debug('Derived base URL: %s', this.#baseUrl);
        if (!this.#baseUrl) {
            throw new Error(`Could not determine the base URL from the module URL "${moduleUrl}".  Are you passing the correct module URL? If not doing so, use import.meta.url.`);
        }
        this.#entry = lastSegmentRegex.exec(moduleUrl)?.[1] ?? '';
        this.#logger.debug('Derived entry name: %s', this.#entry);
        if (!this.#entry) {
            throw new Error(`Could not determine the entry file name from the module URL "${moduleUrl}".  Are you passing the correct module URL? If not doing so, use import.meta.url.`);
        }
        if (!entryCounts[this.#entry]) {
            throw new Error(`The entry name "${this.#entry}" is not defined in the CSS map.  Was the entry file renamed?`);
        }
        this.#cssRecord = cssMap[this.#entry]!;
        // this.#baseUrl += this.#baseUrl.endsWith('/') ? '' : '/';
        this.#options = {
            ...defaultFactoryOptions,
            ...options
        };
    }
    /**
     * Creates a new instance of the *CollageJS* lifecycle functions for the entry file represented by the module URL
     * given to the constructor.
     * 
     * While the `CssFactory` class is instantiated once per entry file, the `instantiate` method is used once per 
     * *CollageJS* piece created.
     * 
     * It provides a `mount` function and a `relocate` function.  As for the latter:
     * 
     * - If your piece doesn't support relocation, then don't bother with the `relocate` function.
     * - If writing generic factory code, check the piece's `relocate` property, and if `undefined`, skip `relocate`.
     * @example
     * ```ts
     * // Entry file: my-entry.js
     * import { CssFactory } from "@collagejs/vite-css";
     * import MyComponent from "some/where/MyComponent.[tsx|svelte|vue|solid|ripple|etc]";
     * import { buildPiece } from "@collagejs/<framework>";
     * 
     * // Only one instance per entry file.  Use it in all factory functions exported by the entry file.
     * // It MUST be a top-level statement, or we risk having this line moved to a non-entry chunk during building.
     * const cssFactory = new CssFactory(import.meta.url);
     * 
     * export function myPieceFactory() {
     *   const { mount, relocate } = cssFactory.instantiate();
     *   const piece = buildPiece(MyComponent);
     *   return {
     *     ...piece,
     *     mount: [mount, piece.mount],
     *     relocate: [relocate, piece.relocate]
     *   };
     * }
     * ```
     * @returns An object that provides mount and relocate *CollageJS*-compliant functions capable of handling the
     * CSS that Vite's build process produces.
     */
    instantiate() {
        const relocateCtx = {} as RelocateContext;
        relocateCtx.mount = mount.bind(undefined, this.#baseUrl, this.#entry, this.#cssRecord, this.#options);

        return {
            mount: relocateCtx.mount,
            relocate: relocate.bind(undefined),
        } satisfies CorePiece;

        async function mount(
            this: undefined,
            base: string,
            entry: string,
            cssRecord: CssRecord,
            opts: Required<CssFactoryOptions>,
            target: AcceptableTarget
        ) {
            const shadowDomCssMap = new Map<string, HTMLLinkElement>();
            const lightDomCssMap = new Map<string, CountControlledData<HTMLLinkElement>>();

            function createShadowDomCssLink(cssFileName: string, base: string) {
                const linkEl = createLinkElement(base + cssFileName, true);
                shadowDomCssMap.set(cssFileName, linkEl);
                return linkEl;
            }

            function createLightDomCssLink(cssFileName: string, base: string) {
                let controlledLink = cssFileCounts[cssFileName];
                if (!controlledLink) {
                    const linkEl = createLinkElement(base + cssFileName, false);
                    controlledLink = new CountControlledData<HTMLLinkElement>(linkEl, {
                        onCountRestarted: (controller) => {
                            controller.data.disabled = false;
                        },
                        onCountExhausted: (controller) => {
                            controller.data.disabled = true;
                        }
                    });
                    cssFileCounts[cssFileName] = controlledLink;
                }
                lightDomCssMap.set(cssFileName, controlledLink);
                controlledLink.increase();
                return controlledLink;
            }

            if (!observer) {
                observer = observeHead();
            }
            let cssFiles: Iterable<string> = cssRecord.static;
            const isShadowRoot = target instanceof ShadowRoot;
            if (isShadowRoot) {
                cssFiles = new Set([...cssRecord.static, ...cssRecord.dynamic]);
            }
            const cssPromises = [];
            for (let css of cssFiles) {
                // The load event doesn't seem to fire for pre-existing elements that are merely re-enabled, even though a
                // network request might show up in the Network tab of the browser's developer tools.  Therefore, only 
                // attempt FOUC prevention on new CSS links.
                const addFouc = isShadowRoot || !cssFileCounts[css];
                const linkEl = isShadowRoot ? createShadowDomCssLink(css, base) : createLightDomCssLink(css, base).data;
                cssPromises.push(mountCssFile(css, linkEl, addFouc, opts.loadTimeout, isShadowRoot ? target : document.head, isShadowRoot));
            }
            await processCssPromises(cssPromises, opts);
            if (!isShadowRoot) {
                entryCounts[entry]!.increase();
            }
            relocateCtx.unmount = () => {
                if (isShadowRoot) {
                    for (let css of shadowDomCssMap.values()) {
                        css.remove();
                    }
                }
                else {
                    entryCounts[entry]!.decrease();
                    for (let c of lightDomCssMap.values()) {
                        c.decrease();
                    }
                }
                return Promise.resolve();
            };
            return () => {
                return relocateCtx.unmount?.() ?? Promise.resolve();
            }
        }

        async function relocate(this: undefined, source: AcceptableTarget, target: AcceptableTarget): ReturnType<RelocateFn> {
            // If moving from light DOM to light DOM, or from shadow DOM to shadow DOM, then there's no extra work needed.
            if ((source instanceof ShadowRoot && target instanceof ShadowRoot) ||
                (source instanceof DocumentFragment && target instanceof DocumentFragment)) {
                return 'supported';
            }
            // For crossing from light DOM to shadow DOM, or from shadow DOM to light DOM, the general process is to
            // perform an unmount of the CSS and then mount it again in the new target.
            // A rollback function must be prepared and the `'done'` status must be returned along with the rollback
            // to tell the caller that work was done and that it can be rolled back if needed.
            const rollbackFn = async () => {
                await relocateCtx.mount(source);
            };
            await relocateCtx.unmount?.();
            await relocateCtx.mount(target);
            return ['done', rollbackFn];
        }
    }
}

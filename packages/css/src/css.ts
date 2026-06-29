/// <reference types="vite/client" />

import { type CssMountFactoryOptions, type MountBindOptions } from "./ex-types.js";
import { createLinkElement, defaultFactoryOptions, processCssPromises, wireCssLinkElement, type LinkLoadResult } from "./css-helpers.js";
export { configureLogger } from "./logger.js";
import { getLogger } from "./logger.js";
import { CssMap } from "./private-types.js";
import { AcceptableTarget, MountFn } from "@collagejs/core";
import { CountControlledData } from "./CountControlledData.js";

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
 * Injection variable that receives from the build process a JSON object that maps entry points to their associated CSS 
 * files.
 */
const cssInjectedMap = '{cjcss:CSS_MAP}';
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
                css.disabled = !isDynCssInUse(css.href);
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
 * Vite's base URL, which is used to construct the full URL for the CSS files to be mounted.  This base is overridable 
 * at the mount function level for unusual use cases, like mounting a *CollageJS* piece directly from a CDN network.
 */
const viteBase = import.meta.env.BASE_URL;

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
    let cssFileName: keyof typeof dynCssMap;
    for (let key in dynCssMap) {
        if (link.href.endsWith(key)) {
            cssFileName = key;
            break;
        }
    }
    // @ts-expect-error TS2454
    if (!cssFileName) {
        // This should never happen, but if it does, it is a CSS file that does have the project ID in its name, but
        // is not registered under any entry file name.  It is best to just leave it alone.  If people complain, then 
        // the issue can be investigated further, but for now, it is best to just ignore it.
        logger.debug('A CSS file that matched the project ID "%s" criterion was injected into HEAD, but it is not registered under any entry.  Leaving it enabled and untracked.  File: %s', projectId, link.href);
        return;
    }
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
 * Returns a *CollageJS*-compliant mount function that can be used to mount the CSS files associated with the given entry
 * file.
 * 
 * The algorithm supports mounting *CollageJS* pieces in light DOM or shadow DOM, and will mount the CSS files 
 * accordingly.  If the mount function is called with a shadow root as the target, the CSS files will be mounted in the 
 * shadow DOM directly.
 * 
 * If the mount function is called with a light DOM target, the CSS files will be mounted in the HEAD element of the 
 * document, and will be disabled when no *CollageJS* pieces that depend on them are mounted in light DOM.
 * 
 * @param entry Name of the entry (input) file used to identify the set of CSS stylesheets needed.
 * @param options Optional set of options to further adjust the behavior of the CSS-mounting algorithm.
 * @returns A *CollageJS*-compliant mount function that can participate in *CollageJS* pieces' lifecycles.
 */
export function cssMountFactory(entry: string, options?: CssMountFactoryOptions) {
    const opts: Required<CssMountFactoryOptions> = {
        ...defaultFactoryOptions,
        ...options
    };
    if (!entryCounts[entry]) {
        throw new Error(`The entry point "${entry}" is not defined in the CSS map.  Was the entry file renamed?`);
    }
    const cssRecord = cssMap[entry]!;

    return mount satisfies MountFn;

    async function mount(this: MountBindOptions | undefined, target: AcceptableTarget) {
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
                lightDomCssMap.set(cssFileName, controlledLink);
                cssFileCounts[cssFileName] = controlledLink;
            }
            controlledLink.increase();
            return controlledLink;
        }

        if (!observer) {
            observer = observeHead();
        }
        let base = this?.base ?? viteBase;
        base += base.endsWith('/') ? '' : '/';
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
        return () => {
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
    }
}

/**
 * Mounts the specified CSS filename as a CSS link element in the HEAD element.  The function returns a promise that 
 * resolves once the load event of the LINK element fires.
 * @param cssFileName The CSS filename to be mounted.
 */
function mountCssFile(cssFileName: string, linkEl: HTMLLinkElement, addFouc: boolean, loadTimeout: number, target: AcceptableTarget, isShadowRoot: boolean) {
    return new Promise<LinkLoadResult>((rslv, _rjct) => {
        target[isShadowRoot ? 'prepend' : 'appendChild'](linkEl);
        if (!addFouc) {
            rslv({ status: 'ok' });
            return;
        }
        rslv(wireCssLinkElement(linkEl, cssFileName, projectId, loadTimeout));
    });
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

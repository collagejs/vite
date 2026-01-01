import type { ImportMap } from "@collagejs/shared";

// CollageJS Import Map Sender for Shell Applications
(function (isRoot: boolean = true, postEndpoint: string = '/__current_import_map') {
    function extractImportMap() {
        const importMapScripts = globalThis.document.querySelectorAll('script[type="importmap"]');
        if (importMapScripts.length === 0) return null;

        try {
            const combinedImportMap = { imports: {}, scopes: {} };
            importMapScripts.forEach(script => {
                const importMapData = JSON.parse(script.textContent || '{}');
                if (importMapData.imports) Object.assign(combinedImportMap.imports, importMapData.imports);
                if (importMapData.scopes) Object.assign(combinedImportMap.scopes, importMapData.scopes);
            });
            return combinedImportMap;
        } catch (error) {
            console.error('[@collagejs/vite-aim] Failed to extract import map:', error);
            return null;
        }
    }

    function getLocalhostOrigins(importMap: ImportMap) {
        if (!importMap.imports) return [];
        const origins = new Set<string>();
        Object.values(importMap.imports).forEach(url => {
            if (typeof url === 'string' && url.includes('localhost')) {
                try {
                    const urlObj = new URL(url);
                    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                        origins.add(`${urlObj.protocol}//${urlObj.host}`);
                    }
                } catch (error) { }
            }
        });
        return Array.from(origins);
    }

    function getHostOrigin() {
        // Return the current page's origin for sending to host server
        return window.location.origin;
    }

    async function sendImportMapToServer(origin: string, importMap: ImportMap) {
        try {
            const response = await fetch(`${origin}${postEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(importMap)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            console.log(`[@collagejs/vite-aim] Sent import map to ${origin}.`);
            return true;
        } catch (error) {
            console.warn(`[@collagejs/vite-aim] Failed to send to ${origin}:`, (error as Error).message);
            return false;
        }
    }

    function initImportMapSender() {
        const importMap = extractImportMap();
        if (!importMap) return;

        const origins = new Set<string>();

        if (isRoot) {
            origins.add(getHostOrigin());
        }

        // Always send to localhost dev servers found in import map
        const localhostOrigins = getLocalhostOrigins(importMap);
        localhostOrigins.forEach(origin => origins.add(origin));

        if (origins.size === 0) {
            console.log('[@collagejs/vite-aim] No dev servers found');
            return;
        }

        console.log(`[@collagejs/vite-aim] Sending to ${origins.size} dev servers`);
        origins.forEach(origin => sendImportMapToServer(origin, importMap));
    }

    initImportMapSender();
})();
const noCss = () => Promise.resolve();

export function cssMountFactory(entryPoint: string) {
    return () => {
        return noCss();
    }
};

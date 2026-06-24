export { configureLogger } from "./logger.js";

const noCss = () => Promise.resolve();

export function cssMountFactory() {
    return () => {
        return noCss();
    }
};

export { configureLogger } from "./logger.js";

const noCss = () => Promise.resolve();

export class CssFactory {
    instantiate() { 
        return {
            mount: () => noCss(),
            relocate: noCss
        }
    }
};

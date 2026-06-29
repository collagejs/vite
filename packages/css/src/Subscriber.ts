export class Subscriber<T extends (...args: any[]) => any> {
    #subs: Set<T>;

    constructor() {
        this.#subs = new Set<T>();
    }

    subscribe(fn: T) {
        this.#subs.add(fn);
        return () => {
            this.#subs.delete(fn);
        }
    }

    notify(...args: Parameters<T>) {
        for (let fn of this.#subs) {
            fn(...args);
        }
    }
}

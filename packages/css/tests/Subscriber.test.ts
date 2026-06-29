import { describe, it, expect, vi } from 'vitest';
import { Subscriber } from '../src/Subscriber.js';

describe("Subscriber", () => {
    it("Should notify subscribers with the correct arguments.", () => {
        const subscriber = new Subscriber<(arg1: number, arg2: string) => void>();
        const mockFn = vi.fn();
        subscriber.subscribe(mockFn);
        subscriber.notify(42, "test");
        expect(mockFn).toHaveBeenCalledWith(42, "test");
    });

    it("Should allow unsubscribing.", () => {
        const subscriber = new Subscriber<(arg: string) => void>();
        const mockFn = vi.fn();
        const unsubscribe = subscriber.subscribe(mockFn);
        unsubscribe();
        subscriber.notify("test");
        expect(mockFn).not.toHaveBeenCalled();
    });
});

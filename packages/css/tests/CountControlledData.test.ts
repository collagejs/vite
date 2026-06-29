import { describe, it, expect, vi } from 'vitest';
import { CountControlledData } from '../src/CountControlledData.js';

describe('CountControlledData', () => {
    describe("constructor", () => {
        it("Should return an instance of CountControlledData.", () => {
            const data = new CountControlledData(0);
            expect(data).toBeInstanceOf(CountControlledData);
        });
    });
    describe("count", () => {
        it("Should return the initial count value of 0.", () => {
            const data = new CountControlledData(0);
            expect(data.count).toBe(0);
        });
        it("Should return the correct count value after increments and decrements.", () => {
            const data = new CountControlledData(0);
            data.increase();
            data.increase();
            expect(data.count).toBe(2);
            data.decrease();
            expect(data.count).toBe(1);
        });
    });
    describe("data", () => {
        it("Should return the data given to the constructor.", () => {
            const data = new CountControlledData(42);
            expect(data.data).toBe(42);
        });
    });
    describe("increase", () => {
        it("Should increase the count by 1.", () => {
            const data = new CountControlledData(0);
            data.increase();
            expect(data.count).toBe(1);
        });
        it("Should call the onCountRestarted callback when count goes from 0 to 1.", () => {
            let callback = vi.fn();
            const data = new CountControlledData(0, {
                onCountRestarted: callback
            });
            data.increase();
            expect(callback).toHaveBeenCalledOnce();
        });
        it("Should not call the onCountRestarted callback if count does not go from 0 to 1.", () => {
            let callback = vi.fn();
            const data = new CountControlledData(0, {
                onCountRestarted: callback
            });
            data.increase();
            data.increase();
            expect(callback).toHaveBeenCalledOnce();
        });
        it("Should pass the controller object to the onCountRestarted callback.", () => {
            let callback = vi.fn();
            const data = new CountControlledData(0, {
                onCountRestarted: callback
            });
            data.increase();
            expect(callback).toHaveBeenCalledWith(data);
        });
    });
    describe("decrease", () => {
        it("Should decrease the count by 1.", () => {
            const data = new CountControlledData(0);
            data.increase();
            data.decrease();
            expect(data.count).toBe(0);
        });
        it("Should throw an error if decrementing below zero.", () => {
            const data = new CountControlledData(0);
            expect(() => data.decrease()).toThrow();
        });
        it("Should call the onCountExhausted callback when count reaches zero.", () => {
            let callback = vi.fn();
            const data = new CountControlledData(1, {
                onCountExhausted: callback
            });
            data.increase();
            data.decrease();
            expect(callback).toHaveBeenCalledOnce();
        });
        it("Should not call the onCountExhausted callback if count does not reach zero.", () => {
            let callback = vi.fn();
            const data = new CountControlledData(2, {
                onCountExhausted: callback
            });
            data.increase();
            data.increase();
            data.decrease();
            expect(callback).not.toHaveBeenCalled();
        });
        it("Should pass the controller object to the onCountExhausted callback.", () => {
            let callback = vi.fn();
            const data = new CountControlledData(1, {
                onCountExhausted: callback
            });
            data.increase();
            data.decrease();
            expect(callback).toHaveBeenCalledWith(data);
        });
    });
});
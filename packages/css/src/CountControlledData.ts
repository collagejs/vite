import { Subscriber } from "./Subscriber";

/**
 * ### CountControlledDataOptions
 * 
 * This type defines the options that can be passed to the `CountControlledData` class.
 */
export type CountControlledDataOptions<T = any> = {
    /**
     * Optional callback executed when the internal counter reaches zero.
     * @param controller This controller object.
     */
    onCountExhausted?: (controller: CountControlledData<T>) => void;
    /**
     * Optional callback executed when the internal counter is restarted (counter from 0 to 1).
     * @param controller This controller object.
     */
    onCountRestarted?: (controller: CountControlledData<T>) => void;
};

/**
 * ### CountControlledData
 * 
 * This class is a utility that wraps around arbitrary data with a counter mechanism that calls back once the internal 
 * counter reaches zero.
 */
export class CountControlledData<T = any> {
    /**
     * The data being controlled by this class.
     */
    #data: T;
    /**
     * The internal counter that tracks the number of increments and decrements.
     */
    #count: number;
    /**
     * An optional callback function that is invoked when the internal counter reaches zero.
     * @param controller The instance of `CountControlledData` that has reached a count of zero.
     */
    #onCountExhausted: Subscriber<(controller: CountControlledData<T>) => void>;
    /**
     * An optional callback function that is invoked when the internal counter is restarted (counter from 0 to 1).
     * @param controller The instance of `CountControlledData` that has been restarted.
     */
    #onCountRestarted: Subscriber<(controller: CountControlledData<T>) => void>;
    /**
     * Creates an instance of `CountControlledData`.
     * @param data Data associated to the counting mechanism.
     * @param options Optional set of options for callbacks and other behaviors.
     */
    constructor(data: T, options?: CountControlledDataOptions<T>) {
        this.#data = data;
        this.#count = 0;
        this.#onCountExhausted = new Subscriber();
        this.#onCountRestarted = new Subscriber();
        if (options?.onCountExhausted) {
            this.#onCountExhausted.subscribe(options.onCountExhausted);
        }
        if (options?.onCountRestarted) {
            this.#onCountRestarted.subscribe(options.onCountRestarted);
        }
    }
    /**
     * Increments the internal counter by one.
     */
    increase() {
        if (++this.#count === 1 && this.#onCountRestarted) {
            this.#onCountRestarted.notify(this);
        }
    }
    /**
     * Decrements the internal counter by one. If the counter reaches zero, the optional callback is invoked.
     */
    decrease() {
        if (this.#count <= 0) {
            throw new Error('CountControlledData: Cannot decrement count below zero.');
        }
        if (--this.#count === 0 && this.#onCountExhausted) {
            this.#onCountExhausted.notify(this);
        }
    }
    /**
     * Gets the current count value.
     */
    get count() {
        return this.#count;
    }
    /**
     * Gets the data associated with this instance.
     */
    get data() {
        return this.#data;
    }
    /**
     * Subscribes a callback function to be notified when the internal counter reaches zero.
     * @param callback Callback function to be notified on count exhaustion.
     */
    onCountExhausted(callback: (controller: CountControlledData<T>) => void) {
        this.#onCountExhausted.subscribe(callback);
    }
    /**
     * Subscribes a callback function to be notified when the internal counter is restarted (counter from 0 to 1).
     * @param callback Callback function to be notified on count restart.
     */
    onCountRestarted(callback: (controller: CountControlledData<T>) => void) {
        this.#onCountRestarted.subscribe(callback);
    }
}
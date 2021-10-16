import type { Writable } from "svelte/store";
/**
 * A store that keep it's value in time.
 */
export interface PersistentStore<T> extends Writable<T> {
    /**
     * Delete the store value from the persistent storage
     */
    delete(): void;
}
/**
 * Storage interface
 */
export interface StorageInterface<T> {
    /**
     * Get a value from the storage.
     *
     * If the value doesn't exists in the storage, `null` should be returned.
     * This method MUST be synchronous.
     * @param key The key/name of the value to retrieve
     */
    getValue(key: string): T | null;
    /**
     * Save a value in the storage.
     * @param key The key/name of the value to save
     * @param value The value to save
     */
    setValue(key: string, value: T): void;
    /**
     * Remove a value from the storage
     * @param key The key/name of the value to remove
     */
    deleteValue(key: string): void;
}
export interface SelfUpdateStorageInterface<T> extends StorageInterface<T> {
    /**
     * Add a listener to the storage values changes
     * @param {string} key The key to listen
     * @param {(newValue: T) => void} listener The listener callback function
     */
    addListener(key: string, listener: (newValue: T) => void): void;
    /**
     * Remove a listener from the storage values changes
     * @param {string} key The key that was listened
     * @param {(newValue: T) => void} listener The listener callback function to remove
     */
    removeListener(key: string, listener: (newValue: T) => void): void;
}
/**
 * Make a store persistent
 * @param {Writable<*>} store The store to enhance
 * @param {StorageInterface} storage The storage to use
 * @param {string} key The name of the data key
 */
export declare function persist<T>(store: Writable<T>, storage: StorageInterface<T>, key: string): PersistentStore<T>;
/**
 * Storage implementation that use the browser local storage
 * @param {boolean} listenExternalChanges - Update the store if the localStorage is updated from another page
 */
export declare function localStorage<T>(listenExternalChanges?: boolean): StorageInterface<T>;
/**
 * Storage implementation that use the browser session storage
 * @param {boolean} listenExternalChanges - Update the store if the sessionStorage is updated from another page
 */
export declare function sessionStorage<T>(listenExternalChanges?: boolean): StorageInterface<T>;
/**
 * Storage implementation that use the browser cookies
 */
export declare function cookieStorage(): StorageInterface<any>;
/**
 * Storage implementation that use the browser IndexedDB
 */
export declare function indexedDBStorage<T>(): SelfUpdateStorageInterface<T>;
/**
 * Storage implementation that do nothing
 */
export declare function noopStorage(): StorageInterface<any>;

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.PersistentStore = {}));
})(this, (function (exports) { 'use strict';

  var browserCookies = {};

  (function (exports) {
  exports.defaults = {};

  exports.set = function(name, value, options) {
    // Retrieve options and defaults
    var opts = options || {};
    var defaults = exports.defaults;

    // Apply default value for unspecified options
    var expires  = opts.expires  || defaults.expires;
    var domain   = opts.domain   || defaults.domain;
    var path     = opts.path     !== undefined ? opts.path     : (defaults.path !== undefined ? defaults.path : '/');
    var secure   = opts.secure   !== undefined ? opts.secure   : defaults.secure;
    var httponly = opts.httponly !== undefined ? opts.httponly : defaults.httponly;
    var samesite = opts.samesite !== undefined ? opts.samesite : defaults.samesite;

    // Determine cookie expiration date
    // If succesful the result will be a valid Date, otherwise it will be an invalid Date or false(ish)
    var expDate = expires ? new Date(
        // in case expires is an integer, it should specify the number of days till the cookie expires
        typeof expires === 'number' ? new Date().getTime() + (expires * 864e5) :
        // else expires should be either a Date object or in a format recognized by Date.parse()
        expires
    ) : 0;

    // Set cookie
    document.cookie = name.replace(/[^+#$&^`|]/g, encodeURIComponent)                // Encode cookie name
    .replace('(', '%28')
    .replace(')', '%29') +
    '=' + value.replace(/[^+#$&/:<-\[\]-}]/g, encodeURIComponent) +                  // Encode cookie value (RFC6265)
    (expDate && expDate.getTime() >= 0 ? ';expires=' + expDate.toUTCString() : '') + // Add expiration date
    (domain   ? ';domain=' + domain     : '') +                                      // Add domain
    (path     ? ';path='   + path       : '') +                                      // Add path
    (secure   ? ';secure'               : '') +                                      // Add secure option
    (httponly ? ';httponly'             : '') +                                      // Add httponly option
    (samesite ? ';samesite=' + samesite : '');                                       // Add samesite option
  };

  exports.get = function(name) {
    var cookies = document.cookie.split(';');
    
    // Iterate all cookies
    while(cookies.length) {
      var cookie = cookies.pop();

      // Determine separator index ("name=value")
      var separatorIndex = cookie.indexOf('=');

      // IE<11 emits the equal sign when the cookie value is empty
      separatorIndex = separatorIndex < 0 ? cookie.length : separatorIndex;

      var cookie_name = decodeURIComponent(cookie.slice(0, separatorIndex).replace(/^\s+/, ''));

      // Return cookie value if the name matches
      if (cookie_name === name) {
        return decodeURIComponent(cookie.slice(separatorIndex + 1));
      }
    }

    // Return `null` as the cookie was not found
    return null;
  };

  exports.erase = function(name, options) {
    exports.set(name, '', {
      expires:  -1,
      domain:   options && options.domain,
      path:     options && options.path,
      secure:   0,
      httponly: 0}
    );
  };

  exports.all = function() {
    var all = {};
    var cookies = document.cookie.split(';');

    // Iterate all cookies
    while(cookies.length) {
      var cookie = cookies.pop();

      // Determine separator index ("name=value")
      var separatorIndex = cookie.indexOf('=');

      // IE<11 emits the equal sign when the cookie value is empty
      separatorIndex = separatorIndex < 0 ? cookie.length : separatorIndex;

      // add the cookie name and value to the `all` object
      var cookie_name = decodeURIComponent(cookie.slice(0, separatorIndex).replace(/^\s+/, ''));
      all[cookie_name] = decodeURIComponent(cookie.slice(separatorIndex + 1));
    }

    return all;
  };
  }(browserCookies));

  /**
   * https://bugs.webkit.org/show_bug.cgi?id=226547
   * Safari has a horrible bug where IDB requests can hang while the browser is starting up.
   * The only solution is to keep nudging it until it's awake.
   * This probably creates garbage, but garbage is better than totally failing.
   */
  function idbReady() {
      const isSafari = !navigator.userAgentData &&
          /Safari\//.test(navigator.userAgent) &&
          !/Chrom(e|ium)\//.test(navigator.userAgent);
      // No point putting other browsers or older versions of Safari through this mess.
      if (!isSafari || !indexedDB.databases)
          return Promise.resolve();
      let intervalId;
      return new Promise((resolve) => {
          const tryIdb = () => indexedDB.databases().finally(resolve);
          intervalId = setInterval(tryIdb, 100);
          tryIdb();
      }).finally(() => clearInterval(intervalId));
  }

  function promisifyRequest(request) {
      return new Promise((resolve, reject) => {
          // @ts-ignore - file size hacks
          request.oncomplete = request.onsuccess = () => resolve(request.result);
          // @ts-ignore - file size hacks
          request.onabort = request.onerror = () => reject(request.error);
      });
  }
  function createStore(dbName, storeName) {
      const dbp = idbReady().then(() => {
          const request = indexedDB.open(dbName);
          request.onupgradeneeded = () => request.result.createObjectStore(storeName);
          return promisifyRequest(request);
      });
      return (txMode, callback) => dbp.then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
  }
  let defaultGetStoreFunc;
  function defaultGetStore() {
      if (!defaultGetStoreFunc) {
          defaultGetStoreFunc = createStore('keyval-store', 'keyval');
      }
      return defaultGetStoreFunc;
  }
  /**
   * Get a value by its key.
   *
   * @param key
   * @param customStore Method to get a custom store. Use with caution (see the docs).
   */
  function get(key, customStore = defaultGetStore()) {
      return customStore('readonly', (store) => promisifyRequest(store.get(key)));
  }
  /**
   * Set a value with a key.
   *
   * @param key
   * @param value
   * @param customStore Method to get a custom store. Use with caution (see the docs).
   */
  function set(key, value, customStore = defaultGetStore()) {
      return customStore('readwrite', (store) => {
          store.put(value, key);
          return promisifyRequest(store.transaction);
      });
  }
  /**
   * Delete a particular key from the store.
   *
   * @param key
   * @param customStore Method to get a custom store. Use with caution (see the docs).
   */
  function del(key, customStore = defaultGetStore()) {
      return customStore('readwrite', (store) => {
          store.delete(key);
          return promisifyRequest(store.transaction);
      });
  }

  /**
   * Make a store persistent
   * @param {Writable<*>} store The store to enhance
   * @param {StorageInterface} storage The storage to use
   * @param {string} key The name of the data key
   */
  function persist(store, storage, key) {
      const initialValue = storage.getValue(key);
      if (null !== initialValue) {
          store.set(initialValue);
      }
      if (storage.addListener) {
          storage.addListener(key, newValue => {
              store.set(newValue);
          });
      }
      store.subscribe(value => {
          storage.setValue(key, value);
      });
      return Object.assign(Object.assign({}, store), { delete() {
              storage.deleteValue(key);
          } });
  }
  function getBrowserStorage(browserStorage, listenExternalChanges = false) {
      const listeners = [];
      const listenerFunction = (event) => {
          const eventKey = event.key;
          if (event.storageArea === browserStorage) {
              listeners
                  .filter(({ key }) => key === eventKey)
                  .forEach(({ listener }) => {
                  let value = event.newValue;
                  try {
                      value = JSON.parse(event.newValue);
                  }
                  catch (e) {
                      // Do nothing
                      // use the value "as is"
                  }
                  listener(value);
              });
          }
      };
      const connect = () => {
          if (listenExternalChanges && typeof window !== "undefined" && (window === null || window === void 0 ? void 0 : window.addEventListener)) {
              window.addEventListener("storage", listenerFunction);
          }
      };
      const disconnect = () => {
          if (listenExternalChanges && typeof window !== "undefined" && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
              window.removeEventListener("storage", listenerFunction);
          }
      };
      return {
          addListener(key, listener) {
              listeners.push({ key, listener });
              if (listeners.length === 1) {
                  connect();
              }
          },
          removeListener(key, listener) {
              const index = listeners.indexOf({ key, listener });
              if (index !== -1) {
                  listeners.splice(index, 1);
              }
              if (listeners.length === 0) {
                  disconnect();
              }
          },
          getValue(key) {
              let value = browserStorage.getItem(key);
              if (value !== null && value !== undefined) {
                  try {
                      value = JSON.parse(value);
                  }
                  catch (e) {
                      // Do nothing
                      // use the value "as is"
                  }
              }
              return value;
          },
          deleteValue(key) {
              browserStorage.removeItem(key);
          },
          setValue(key, value) {
              browserStorage.setItem(key, JSON.stringify(value));
          }
      };
  }
  /**
   * Storage implementation that use the browser local storage
   * @param {boolean} listenExternalChanges - Update the store if the localStorage is updated from another page
   */
  function localStorage(listenExternalChanges = false) {
      if (typeof window !== "undefined" && (window === null || window === void 0 ? void 0 : window.localStorage)) {
          return getBrowserStorage(window.localStorage, listenExternalChanges);
      }
      return noopStorage();
  }
  /**
   * Storage implementation that use the browser session storage
   * @param {boolean} listenExternalChanges - Update the store if the sessionStorage is updated from another page
   */
  function sessionStorage(listenExternalChanges = false) {
      if (typeof window !== "undefined" && (window === null || window === void 0 ? void 0 : window.sessionStorage)) {
          return getBrowserStorage(window.sessionStorage, listenExternalChanges);
      }
      return noopStorage();
  }
  /**
   * Storage implementation that use the browser cookies
   */
  function cookieStorage() {
      if (typeof document === "undefined" || typeof (document === null || document === void 0 ? void 0 : document.cookie) !== "string") {
          return noopStorage();
      }
      return {
          getValue(key) {
              const value = browserCookies.get(key);
              if (value === null) {
                  return null;
              }
              try {
                  return JSON.parse(value);
              }
              catch (e) {
                  return value;
              }
          },
          deleteValue(key) {
              browserCookies.erase(key, { samesite: "Strict" });
          },
          setValue(key, value) {
              browserCookies.set(key, JSON.stringify(value), { samesite: "Strict" });
          }
      };
  }
  /**
   * Storage implementation that use the browser IndexedDB
   */
  function indexedDBStorage() {
      if (typeof indexedDB !== "object" || typeof window === "undefined" || typeof (window === null || window === void 0 ? void 0 : window.indexedDB) !== "object") {
          return noopSelfUpdateStorage();
      }
      const database = createStore("svelte-persist", "persist");
      const listeners = [];
      const listenerFunction = (eventKey, newValue) => {
          if (newValue === undefined) {
              return;
          }
          listeners
              .filter(({ key }) => key === eventKey)
              .forEach(({ listener }) => listener(newValue));
      };
      return {
          addListener(key, listener) {
              listeners.push({ key, listener });
          },
          removeListener(key, listener) {
              const index = listeners.indexOf({ key, listener });
              if (index !== -1) {
                  listeners.splice(index, 1);
              }
          },
          getValue(key) {
              get(key, database).then(value => listenerFunction(key, value));
              return null;
          },
          setValue(key, value) {
              set(key, value, database);
          },
          deleteValue(key) {
              del(key, database);
          }
      };
  }
  /**
   * Storage implementation that do nothing
   */
  function noopStorage() {
      return {
          getValue() {
              return null;
          },
          deleteValue() {
              // Do nothing
          },
          setValue() {
              // Do nothing
          }
      };
  }
  function noopSelfUpdateStorage() {
      return {
          addListener() {
              // Do nothing
          },
          removeListener() {
              // Do nothing
          },
          getValue() {
              return null;
          },
          deleteValue() {
              // Do nothing
          },
          setValue() {
              // Do nothing
          }
      };
  }

  exports.cookieStorage = cookieStorage;
  exports.indexedDBStorage = indexedDBStorage;
  exports.localStorage = localStorage;
  exports.noopStorage = noopStorage;
  exports.persist = persist;
  exports.sessionStorage = sessionStorage;

  Object.defineProperty(exports, '__esModule', { value: true });

}));

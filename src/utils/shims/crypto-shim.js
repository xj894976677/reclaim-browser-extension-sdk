// Browser-compatible crypto shim for attestor-core
// This provides Node.js-style crypto APIs using Web Crypto API

const cryptoBrowserify = require("crypto-browserify");

// Get the native WebCrypto API - this function is called at runtime
const getWebCrypto = () => {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof self !== "undefined" && self.crypto) {
    return self.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  // Fallback for environments without native crypto
  return null;
};

// Create randomBytes function using native getRandomValues
const randomBytes = function (size, callback) {
  const bytes = new Uint8Array(size);
  const nativeCrypto = getWebCrypto();
  if (nativeCrypto && nativeCrypto.getRandomValues) {
    nativeCrypto.getRandomValues(bytes);
  } else {
    // Fallback to Math.random (not cryptographically secure)
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Convert to Buffer
  const buffer = Buffer.from(bytes);

  // Support both sync and async patterns
  if (callback) {
    setImmediate(() => callback(null, buffer));
    return;
  }
  return buffer;
};

// Create a webcrypto-compatible object for @joclaim/tls
// Use a getter to ensure we get the crypto at runtime, not build time
const webcrypto = new Proxy(
  {},
  {
    get(target, prop) {
      const nativeCrypto = getWebCrypto();
      if (nativeCrypto) {
        const value = nativeCrypto[prop];
        // Bind methods to the native crypto object
        if (typeof value === "function") {
          return value.bind(nativeCrypto);
        }
        return value;
      }
      // Fallback for environments without native crypto
      if (prop === "getRandomValues") {
        return function (arr) {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        };
      }
      if (prop === "subtle") {
        return {};
      }
      return undefined;
    },
  },
);

// Create the shim object
const cryptoShim = {
  ...cryptoBrowserify,
  randomBytes,
  // Export webcrypto for @joclaim/tls compatibility
  webcrypto,
  // Ensure getRandomValues is available at top level
  getRandomValues: function (arr) {
    const nativeCrypto = getWebCrypto();
    if (nativeCrypto && nativeCrypto.getRandomValues) {
      return nativeCrypto.getRandomValues(arr);
    }
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  },
};

module.exports = cryptoShim;
module.exports.default = cryptoShim;
module.exports.webcrypto = webcrypto;
module.exports.randomBytes = randomBytes;

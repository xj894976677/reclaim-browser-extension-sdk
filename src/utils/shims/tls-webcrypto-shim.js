// Browser-compatible webcrypto shim for @joclaim/tls/webcrypto
// This reimplements webcryptoCrypto using browser's native Web Crypto API

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
  return null;
};

// Get subtle at runtime, not build time
const getSubtle = () => {
  const nativeCrypto = getWebCrypto();
  return nativeCrypto?.subtle;
};

// Import required utilities from the main package
// These don't depend on Node.js crypto
const X25519_PRIVATE_KEY_DER_PREFIX = new Uint8Array([
  48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 110, 4, 34, 4, 32,
]);

const P384_PRIVATE_KEY_DER_PREFIX = new Uint8Array([
  0x30, 0x81, 0xb6, 0x02, 0x01, 0x00, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
  0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x04, 0x81, 0x9e, 0x30, 0x81, 0x9b, 0x02, 0x01,
  0x01, 0x04, 0x30,
]);

const P256_PRIVATE_KEY_DER_PREFIX = new Uint8Array([
  0x30, 0x81, 0xb6, 0x02, 0x01, 0x00, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
  0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x04, 0x81, 0x9e, 0x30, 0x81, 0x9b, 0x02, 0x01,
  0x01, 0x04, 0x30,
]);

const SHARED_KEY_LEN_MAP = {
  X25519: 32,
  "P-384": 48,
  "P-256": 32,
};

const AUTH_TAG_BYTE_LENGTH = 16;

function concatenateUint8Arrays(arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function asciiToUint8Array(str) {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

function toUint8Array(buffer) {
  return new Uint8Array(buffer);
}

// ChaCha20-Poly1305 from @noble/ciphers
let chacha20poly1305;
try {
  chacha20poly1305 = require("@noble/ciphers/chacha").chacha20poly1305;
} catch (e) {
  chacha20poly1305 = null;
}

// AES-CBC from @noble/ciphers
let aesCbc;
try {
  aesCbc = require("@noble/ciphers/aes").cbc;
} catch (e) {
  aesCbc = null;
}

// RSA from micro-rsa-dsa-dh
let PKCS1_KEM;
try {
  PKCS1_KEM = require("micro-rsa-dsa-dh/rsa.js").PKCS1_KEM;
} catch (e) {
  PKCS1_KEM = null;
}

// ASN1 parsing
let AsnParser, ECDSASigValue;
try {
  AsnParser = require("@peculiar/asn1-schema").AsnParser;
  ECDSASigValue = require("@peculiar/asn1-ecc").ECDSASigValue;
} catch (e) {
  AsnParser = null;
  ECDSASigValue = null;
}

function parseRsaPublicKeyFromAsn1(raw) {
  // Simple passthrough - the actual parsing is done in the original package
  return raw;
}

function getHashAlgorithm(sig) {
  if (sig.endsWith("SHA256")) {
    return "SHA-256";
  } else if (sig.endsWith("SHA384")) {
    return "SHA-384";
  } else if (sig.endsWith("SHA512")) {
    return "SHA-512";
  } else if (sig.endsWith("SHA1")) {
    return "SHA-1";
  }
  throw new Error(`Unsupported signature algorithm: ${sig}`);
}

function convertASN1toRS(signatureBytes) {
  if (!AsnParser || !ECDSASigValue) {
    throw new Error("ASN1 parsing not available");
  }
  const data = AsnParser.parse(signatureBytes, ECDSASigValue);
  const r = cleanBigNum(new Uint8Array(data.r));
  const s = cleanBigNum(new Uint8Array(data.s));
  return concatenateUint8Arrays([r, s]);
}

function cleanBigNum(bn) {
  if (bn.length > 32 && bn[0] === 0) {
    bn = bn.slice(1);
  } else if (bn.length < 32) {
    bn = concatenateUint8Arrays([new Uint8Array(32 - bn.length).fill(0), bn]);
  }
  return bn;
}

const webcryptoCrypto = {
  async importKey(alg, raw, ...args) {
    let subtleArgs;
    let keyUsages;
    let keyType = "raw";
    switch (alg) {
      case "AES-256-GCM":
      case "AES-128-GCM":
        subtleArgs = {
          name: "AES-GCM",
          length: alg === "AES-256-GCM" ? 256 : 128,
        };
        keyUsages = ["encrypt", "decrypt"];
        break;
      case "AES-128-CBC":
        subtleArgs = {
          name: "AES-CBC",
          length: 128,
        };
        keyUsages = ["encrypt", "decrypt"];
        break;
      case "CHACHA20-POLY1305":
        return raw;
      case "SHA-1":
      case "SHA-256":
      case "SHA-384":
        subtleArgs = {
          name: "HMAC",
          hash: { name: alg },
        };
        keyUsages = ["sign", "verify"];
        break;
      case "P-384":
      case "P-256":
        subtleArgs = {
          name: "ECDH",
          namedCurve: alg,
        };
        keyUsages = [];
        if (args[0] === "private") {
          keyUsages = ["deriveBits"];
          keyType = "pkcs8";
          const prefix =
            alg === "P-256" ? P256_PRIVATE_KEY_DER_PREFIX : P384_PRIVATE_KEY_DER_PREFIX;
          raw = concatenateUint8Arrays([prefix, raw]);
        }
        break;
      case "X25519":
        subtleArgs = { name: "X25519" };
        keyUsages = [];
        if (args[0] === "private") {
          keyUsages = ["deriveBits"];
          keyType = "pkcs8";
          raw = concatenateUint8Arrays([X25519_PRIVATE_KEY_DER_PREFIX, raw]);
        }
        break;
      case "RSA-PSS-SHA256":
        keyType = "spki";
        keyUsages = ["verify"];
        subtleArgs = {
          name: "RSA-PSS",
          hash: "SHA-256",
        };
        break;
      case "RSA-PKCS1-SHA512":
      case "RSA-PKCS1-SHA256":
      case "RSA-PKCS1-SHA384":
      case "RSA-PKCS1-SHA1":
        keyType = "spki";
        keyUsages = ["verify"];
        subtleArgs = {
          name: "RSASSA-PKCS1-v1_5",
          hash: getHashAlgorithm(alg),
        };
        break;
      case "RSA-PCKS1_5":
        return parseRsaPublicKeyFromAsn1(raw);
      case "ECDSA-SECP256R1-SHA256":
      case "ECDSA-SECP256R1-SHA384":
      case "ECDSA-SECP384R1-SHA384":
      case "ECDSA-SECP384R1-SHA256":
        keyType = "spki";
        keyUsages = ["verify"];
        subtleArgs = {
          name: "ECDSA",
          namedCurve: alg.includes("P256") ? "P-256" : "P-384",
        };
        break;
      default:
        throw new Error(`Unsupported algorithm ${alg}`);
    }
    return getSubtle().importKey(keyType, raw, subtleArgs, true, keyUsages);
  },

  async exportKey(key) {
    if (key instanceof Uint8Array) {
      return key;
    }
    if (
      key.type === "private" &&
      (key.algorithm.name === "X25519" || key.algorithm.name === "ECDH")
    ) {
      const form = toUint8Array(await getSubtle().exportKey("pkcs8", key));
      const algPrefix =
        key.algorithm.name === "X25519"
          ? X25519_PRIVATE_KEY_DER_PREFIX
          : P384_PRIVATE_KEY_DER_PREFIX;
      return form.slice(algPrefix.length);
    }
    return toUint8Array(await getSubtle().exportKey("raw", key));
  },

  async generateKeyPair(alg) {
    let genKeyArgs;
    switch (alg) {
      case "P-384":
      case "P-256":
        genKeyArgs = {
          name: "ECDH",
          namedCurve: alg,
        };
        break;
      case "X25519":
        genKeyArgs = { name: "X25519" };
        break;
      default:
        throw new Error(`Unsupported algorithm ${alg}`);
    }
    const keyPair = await getSubtle().generateKey(genKeyArgs, true, ["deriveBits"]);
    return {
      pubKey: keyPair.publicKey,
      privKey: keyPair.privateKey,
    };
  },

  async calculateSharedSecret(alg, privateKey, publicKey) {
    const genKeyName = alg === "X25519" ? "X25519" : "ECDH";
    const key = await getSubtle().deriveBits(
      { name: genKeyName, public: publicKey },
      privateKey,
      8 * SHARED_KEY_LEN_MAP[alg],
    );
    return toUint8Array(key);
  },

  randomBytes(length) {
    const buffer = new Uint8Array(length);
    const nativeCrypto = getWebCrypto();
    if (nativeCrypto && nativeCrypto.getRandomValues) {
      nativeCrypto.getRandomValues(buffer);
    } else {
      for (let i = 0; i < length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
    }
    return buffer;
  },

  asymmetricEncrypt(cipherSuite, { publicKey, data }) {
    if (cipherSuite !== "RSA-PCKS1_5") {
      throw new Error(`Unsupported cipher suite ${cipherSuite}`);
    }
    if (!PKCS1_KEM) {
      throw new Error("RSA encryption not available");
    }
    return PKCS1_KEM.encrypt(publicKey, data);
  },

  async encrypt(cipherSuite, { iv, data, key }) {
    const name = cipherSuite === "AES-128-CBC" ? "AES-CBC" : "";
    return toUint8Array(await getSubtle().encrypt({ name, iv }, key, data)).slice(0, data.length);
  },

  async decrypt(cipherSuite, { key, iv, data }) {
    if (cipherSuite !== "AES-128-CBC") {
      throw new Error(`Unsupported cipher suite: ${cipherSuite}`);
    }
    const rawKey = key instanceof Uint8Array ? key : await this.exportKey(key);
    if (!aesCbc) {
      throw new Error("AES-CBC not available");
    }
    const cipher = aesCbc(rawKey, iv, { disablePadding: true });
    const decrypted = cipher.decrypt(data);
    return decrypted;
  },

  async authenticatedEncrypt(cipherSuite, { iv, aead, key, data }) {
    let ciphertext;
    if (cipherSuite === "CHACHA20-POLY1305") {
      const rawKey = key instanceof Uint8Array ? key : await this.exportKey(key);
      if (!chacha20poly1305) {
        throw new Error("ChaCha20-Poly1305 not available");
      }
      const cipher = chacha20poly1305(rawKey, iv, aead);
      ciphertext = cipher.encrypt(data);
    } else {
      ciphertext = toUint8Array(
        await getSubtle().encrypt({ name: "AES-GCM", iv, additionalData: aead }, key, data),
      );
    }
    return {
      ciphertext: ciphertext.slice(0, -AUTH_TAG_BYTE_LENGTH),
      authTag: ciphertext.slice(-AUTH_TAG_BYTE_LENGTH),
    };
  },

  async authenticatedDecrypt(cipherSuite, { iv, aead, key, data, authTag }) {
    if (!authTag) {
      throw new Error("authTag is required");
    }
    const ciphertext = concatenateUint8Arrays([data, authTag]);
    let plaintext;
    if (cipherSuite === "CHACHA20-POLY1305") {
      const rawKey = key instanceof Uint8Array ? key : await this.exportKey(key);
      if (!chacha20poly1305) {
        throw new Error("ChaCha20-Poly1305 not available");
      }
      const cipher = chacha20poly1305(rawKey, iv, aead);
      plaintext = cipher.decrypt(ciphertext);
    } else {
      plaintext = toUint8Array(
        await getSubtle().decrypt({ name: "AES-GCM", iv, additionalData: aead }, key, ciphertext),
      );
    }
    return { plaintext };
  },

  async verify(alg, { data, signature, publicKey }) {
    let verifyArgs;
    switch (alg) {
      case "RSA-PSS-SHA256":
        verifyArgs = { name: "RSA-PSS", saltLength: 32 };
        break;
      case "RSA-PKCS1-SHA512":
      case "RSA-PKCS1-SHA256":
      case "RSA-PKCS1-SHA384":
      case "RSA-PKCS1-SHA1":
        verifyArgs = { name: "RSASSA-PKCS1-v1_5" };
        break;
      case "ECDSA-SECP256R1-SHA256":
      case "ECDSA-SECP256R1-SHA384":
      case "ECDSA-SECP384R1-SHA256":
      case "ECDSA-SECP384R1-SHA384":
        signature = convertASN1toRS(signature);
        verifyArgs = { name: "ECDSA", hash: getHashAlgorithm(alg) };
        break;
      default:
        throw new Error(`Unsupported algorithm ${alg}`);
    }
    return getSubtle().verify(verifyArgs, publicKey, signature, data);
  },

  async hash(alg, data) {
    return toUint8Array(await getSubtle().digest(alg, data));
  },

  async hmac(alg, key, data) {
    return toUint8Array(await getSubtle().sign({ name: "HMAC", hash: alg }, key, data));
  },

  async extract(alg, hashLength, ikm, salt) {
    salt = typeof salt === "string" ? asciiToUint8Array(salt) : salt;
    if (!salt.length) {
      salt = new Uint8Array(hashLength);
    }
    const key = await this.importKey(alg, salt);
    return this.hmac(alg, key, ikm);
  },
};

// CommonJS exports for webpack compatibility
module.exports = webcryptoCrypto;
module.exports.webcryptoCrypto = webcryptoCrypto;
module.exports.default = webcryptoCrypto;

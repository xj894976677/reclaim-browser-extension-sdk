/**
 * Mock implementation of re2 native module for browser environments
 * This provides a JavaScript fallback using the standard RegExp.
 *
 * attestor-core calls RE2 both ways:
 *   - RE2(pattern, 'sgiu')        ← without new, flags as string
 *   - new RE2(pattern, 'sgiu')    ← with new, flags as string
 */

function RE2(pattern, flags) {
  // Support being called with or without `new`
  if (!(this instanceof RE2)) {
    return new RE2(pattern, flags);
  }

  // flags can be a string like 'sgiu' — pass directly to RegExp
  // RegExp silently ignores the 's' (dotAll) flag in older engines,
  // but modern browsers support it fine.
  if (typeof flags === "object" && flags !== null) {
    // Legacy object form: {ignoreCase, multiline, global}
    let f = "";
    if (flags.ignoreCase) f += "i";
    if (flags.multiline) f += "m";
    if (flags.global) f += "g";
    flags = f;
  }

  this.pattern = pattern;
  this.flags = flags || "";

  try {
    this.regexp = new RegExp(pattern, this.flags);
  } catch (e) {
    console.error("RE2 mock: failed to create RegExp from pattern:", pattern, e);
    this.regexp = new RegExp(".*");
  }

  // Copy RegExp-like properties
  this.source = this.regexp.source;
  this.global = this.regexp.global;
  this.ignoreCase = this.regexp.ignoreCase;
  this.multiline = this.regexp.multiline;
  this.lastIndex = 0;
}

RE2.prototype.test = function (string) {
  this.regexp.lastIndex = this.lastIndex;
  var result = this.regexp.test(string);
  this.lastIndex = this.regexp.lastIndex;
  return result;
};

RE2.prototype.exec = function (string) {
  this.regexp.lastIndex = this.lastIndex;
  var result = this.regexp.exec(string);
  this.lastIndex = this.regexp.lastIndex;
  return result;
};

RE2.prototype.match = function (string) {
  return string.match(this.regexp);
};

RE2.prototype.replace = function (string, replacement) {
  return string.replace(this.regexp, replacement);
};

RE2.prototype.search = function (string) {
  return string.search(this.regexp);
};

RE2.prototype.toString = function () {
  return this.regexp.toString();
};

module.exports = RE2;

module.exports.ANCHOR_BOTH = 0;
module.exports.ANCHOR_END = 1;
module.exports.ANCHOR_NONE = 2;
module.exports.ANCHOR_START = 3;
module.exports.LITERAL = 0;
module.exports.MAX_MATCH = -1;
module.exports.UNANCHORED = 2;

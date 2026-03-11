/**
 * Bridge-safe game serialization for React Native (no Symbol/Map/Set over the bridge).
 * Used by GameCollectionView and by scripts/test-bridge-serialization.js.
 * Avoids "JS Symbols are not convertible to dynamic" in Hermes/Fabric.
 */

/**
 * Returns a plain object/array copy safe for the RN bridge.
 * Uses JSON round-trip when possible; falls back to manual copy.
 */
function toPlainGame(value) {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    return undefined;
  }
  if (Array.isArray(value)) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value.map((v) => toPlainGame(v) ?? null);
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      const out = {};
      for (const key of Object.keys(value)) {
        try {
          const v = value[key];
          const plain = toPlainGame(v);
          if (plain !== undefined) out[key] = plain;
        } catch (_e) {}
      }
      return out;
    }
  }
  return undefined;
}

/**
 * Prefer JSON round-trip; fallback to toPlainGame for circular refs.
 */
function toPlainGameViaJSON(game) {
  try {
    return JSON.parse(JSON.stringify(game)) ?? {};
  } catch (_) {
    return toPlainGame(game) ?? {};
  }
}

/**
 * Stringify an object with sorted keys so that same content always produces the same string
 * regardless of key order. Ensures React.memo comparators see stable gamePayload when
 * the same game is passed with different object references (e.g. re-created enrichedGames).
 */
function deterministicStringify(obj) {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map((v) => deterministicStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + deterministicStringify(obj[k] === undefined ? null : obj[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Build props suitable for GameCardView in the grid: only gamePayload (string)
 * and preloadedBggDataPayload (string), never a game object.
 * Uses deterministic stringify so identical game content produces the same string
 * even when object references or key order differ between renders.
 */
function buildGridGamePayloads(game) {
  const preloadedBggData = game && (game._bggData || game);
  const plainGame = toPlainGameViaJSON(game || {});
  const plainPreloaded = preloadedBggData != null ? toPlainGameViaJSON(preloadedBggData) : null;
  return {
    gamePayload: deterministicStringify(plainGame),
    preloadedBggDataPayload: plainPreloaded != null ? deterministicStringify(plainPreloaded) : null,
    plainGame,
  };
}

module.exports = {
  toPlainGame,
  toPlainGameViaJSON,
  buildGridGamePayloads,
};

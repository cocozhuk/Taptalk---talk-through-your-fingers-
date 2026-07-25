function pcmByteLength(pcm) {
  return pcm.channels.reduce((total, channel) => total + channel.byteLength, 0);
}

export class PcmCache {
  #entries = new Map();
  #sizeBytes = 0;
  #maxBytes;
  #maxEntries;

  constructor({ maxBytes = 32 * 1024 * 1024, maxEntries = 32 } = {}) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new RangeError("maxBytes must be a non-negative number");
    }
    if (!Number.isInteger(maxEntries) || maxEntries < 0) {
      throw new RangeError("maxEntries must be a non-negative integer");
    }

    this.#maxBytes = maxBytes;
    this.#maxEntries = maxEntries;
  }

  get(key) {
    const value = this.#entries.get(key);
    if (value === undefined) {
      return undefined;
    }

    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value.pcm;
  }

  set(key, pcm) {
    const bytes = pcmByteLength(pcm);
    const existing = this.#entries.get(key);
    if (existing !== undefined) {
      this.#sizeBytes -= existing.bytes;
      this.#entries.delete(key);
    }

    if (bytes > this.#maxBytes || this.#maxEntries === 0) {
      return false;
    }

    this.#entries.set(key, { pcm, bytes });
    this.#sizeBytes += bytes;
    this.#evict();
    return true;
  }

  clear() {
    this.#entries.clear();
    this.#sizeBytes = 0;
  }

  snapshot() {
    return Object.freeze({
      entries: this.#entries.size,
      sizeBytes: this.#sizeBytes,
      maxBytes: this.#maxBytes,
      maxEntries: this.#maxEntries,
    });
  }

  #evict() {
    while (this.#entries.size > this.#maxEntries || this.#sizeBytes > this.#maxBytes) {
      const oldestKey = this.#entries.keys().next().value;
      const oldest = this.#entries.get(oldestKey);
      this.#entries.delete(oldestKey);
      this.#sizeBytes -= oldest.bytes;
    }
  }
}

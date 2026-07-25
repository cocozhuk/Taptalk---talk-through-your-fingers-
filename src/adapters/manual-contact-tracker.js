import { FINGER_IDS, isFingerId } from "../domain/contracts.js";

export const MANUAL_KEYS = Object.freeze(
  Object.fromEntries(
    FINGER_IDS.map((fingerId, index) => [String(index + 1), fingerId]),
  ),
);

export class ManualContactTracker {
  constructor({
    onEvents,
    clock = () => performance.now(),
    sessionId = `manual-${Date.now()}`,
  }) {
    this.onEvents = onEvents;
    this.clock = clock;
    this.sessionId = sessionId;
    this.activeFingers = new Set();
    this.frameId = 0;
    this.cleanups = [];
    this.enabled = true;
  }

  contact(fingerId) {
    if (
      !this.enabled ||
      !isFingerId(fingerId) ||
      this.activeFingers.has(fingerId)
    ) {
      return false;
    }
    this.activeFingers.add(fingerId);
    this.onEvents([this.createEvent("activation", fingerId)]);
    return true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) {
      return;
    }
    for (const fingerId of [...this.activeFingers]) {
      this.separate(fingerId);
    }
  }

  separate(fingerId) {
    if (!this.activeFingers.delete(fingerId)) {
      return false;
    }
    this.onEvents([this.createEvent("separation", fingerId)]);
    return true;
  }

  bind(container, keyboardTarget = globalThis.window) {
    const pointerDown = (event) => {
      const marker = event.target.closest("[data-finger-id]");
      if (!marker) {
        return;
      }
      marker.setPointerCapture?.(event.pointerId);
      this.contact(marker.dataset.fingerId);
    };
    const pointerUp = (event) => {
      const marker = event.target.closest("[data-finger-id]");
      if (marker) {
        this.separate(marker.dataset.fingerId);
      }
    };
    const keyDown = (event) => {
      if (
        event.repeat ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const fingerId = MANUAL_KEYS[event.key];
      if (fingerId) {
        event.preventDefault();
        this.contact(fingerId);
      }
    };
    const keyUp = (event) => {
      const fingerId = MANUAL_KEYS[event.key];
      if (fingerId) {
        this.separate(fingerId);
      }
    };

    container.addEventListener("pointerdown", pointerDown);
    container.addEventListener("pointerup", pointerUp);
    container.addEventListener("pointercancel", pointerUp);
    container.addEventListener("lostpointercapture", pointerUp);
    keyboardTarget?.addEventListener("keydown", keyDown);
    keyboardTarget?.addEventListener("keyup", keyUp);

    this.cleanups.push(
      () => container.removeEventListener("pointerdown", pointerDown),
      () => container.removeEventListener("pointerup", pointerUp),
      () => container.removeEventListener("pointercancel", pointerUp),
      () => container.removeEventListener("lostpointercapture", pointerUp),
      () => keyboardTarget?.removeEventListener("keydown", keyDown),
      () => keyboardTarget?.removeEventListener("keyup", keyUp),
    );
  }

  destroy() {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
    this.activeFingers.clear();
  }

  createEvent(type, fingerId) {
    this.frameId += 1;
    return {
      type,
      fingerId,
      sessionId: this.sessionId,
      timestampMs: this.clock(),
      frameId: this.frameId,
      confidence: 1,
    };
  }
}

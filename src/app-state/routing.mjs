import { FINGER_IDS, isFingerId } from "./constants.mjs";
import {
  resolveVoiceIdentity,
  validateConfiguration,
} from "./configuration.mjs";

const FINGER_RANK = new Map(
  FINGER_IDS.map((fingerId, index) => [fingerId, index]),
);

function rejection(reason, message, input, details = undefined) {
  return {
    reason,
    message,
    input,
    ...(details === undefined ? {} : { details }),
  };
}

function isRouterState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isSafeInteger(value.lastFrameSequence) &&
    typeof value.lastConfirmedAtMs === "number" &&
    Number.isFinite(value.lastConfirmedAtMs) &&
    value.processedEventIds instanceof Set
  );
}

function emptyResult(state, rejections) {
  return {
    state,
    activations: [],
    uiNotifications: [],
    speechRequests: [],
    rejections,
  };
}

function validateContact(contact) {
  if (contact === null || typeof contact !== "object" || Array.isArray(contact)) {
    return rejection(
      "malformed_contact",
      "Contact confirmation must be an object.",
      contact,
    );
  }

  if (typeof contact.eventId !== "string" || contact.eventId.trim().length === 0) {
    return rejection(
      "malformed_contact",
      "Contact confirmation requires a non-empty eventId.",
      contact,
    );
  }

  if (!isFingerId(contact.fingerId)) {
    return rejection(
      "malformed_contact",
      "Contact confirmation contains an unknown fingerId.",
      contact,
    );
  }

  if (
    typeof contact.confirmedAtMs !== "number" ||
    !Number.isFinite(contact.confirmedAtMs) ||
    contact.confirmedAtMs < 0
  ) {
    return rejection(
      "malformed_contact",
      "Contact confirmation requires a finite non-negative timestamp.",
      contact,
    );
  }

  return null;
}

function compareContacts(left, right) {
  const eventIdOrder =
    left.contact.eventId < right.contact.eventId
      ? -1
      : left.contact.eventId > right.contact.eventId
        ? 1
        : 0;

  return (
    left.contact.confirmedAtMs - right.contact.confirmedAtMs ||
    FINGER_RANK.get(left.contact.fingerId) -
      FINGER_RANK.get(right.contact.fingerId) ||
    eventIdOrder ||
    left.index - right.index
  );
}

export function createRouterState() {
  return {
    lastFrameSequence: -1,
    lastConfirmedAtMs: -1,
    processedEventIds: new Set(),
  };
}

/**
 * Purely routes one complete tracking batch into ordered UI and speech effects.
 */
export function routeContactBatch(routerState, configuration, batch) {
  if (!isRouterState(routerState)) {
    throw new TypeError("routerState must come from createRouterState()");
  }

  const checkedConfiguration = validateConfiguration(configuration);
  if (!checkedConfiguration.ok) {
    return emptyResult(routerState, [
      rejection(
        "invalid_configuration",
        checkedConfiguration.error.message,
        configuration,
        checkedConfiguration.error,
      ),
    ]);
  }

  if (
    batch === null ||
    typeof batch !== "object" ||
    Array.isArray(batch) ||
    !Number.isSafeInteger(batch.frameSequence) ||
    batch.frameSequence < 0 ||
    !Array.isArray(batch.contacts)
  ) {
    return emptyResult(routerState, [
      rejection(
        "malformed_batch",
        "Contact batch requires a non-negative frameSequence and contacts array.",
        batch,
      ),
    ]);
  }

  if (batch.frameSequence <= routerState.lastFrameSequence) {
    return emptyResult(routerState, [
      rejection(
        "stale_batch",
        "Contact batch sequence has already been consumed or is out of order.",
        batch,
        {
          lastFrameSequence: routerState.lastFrameSequence,
        },
      ),
    ]);
  }

  const rejections = [];
  const validContacts = [];

  batch.contacts.forEach((contact, index) => {
    const invalid = validateContact(contact);
    if (invalid === null) {
      validContacts.push({ contact, index });
    } else {
      rejections.push(invalid);
    }
  });

  validContacts.sort(compareContacts);

  const processedEventIds = new Set(routerState.processedEventIds);
  const eventIdsInBatch = new Set();
  const fingersInBatch = new Set();
  const activations = [];
  let lastConfirmedAtMs = routerState.lastConfirmedAtMs;

  for (const { contact } of validContacts) {
    if (
      processedEventIds.has(contact.eventId) ||
      eventIdsInBatch.has(contact.eventId)
    ) {
      rejections.push(
        rejection(
          "duplicate_event",
          "Contact eventId has already been processed or appeared earlier in this batch.",
          contact,
        ),
      );
      continue;
    }
    eventIdsInBatch.add(contact.eventId);
    processedEventIds.add(contact.eventId);

    if (fingersInBatch.has(contact.fingerId)) {
      rejections.push(
        rejection(
          "duplicate_finger",
          "Only the first confirmation for a finger in one batch is accepted.",
          contact,
        ),
      );
      continue;
    }
    fingersInBatch.add(contact.fingerId);

    if (contact.confirmedAtMs <= routerState.lastConfirmedAtMs) {
      rejections.push(
        rejection(
          "stale_event",
          "Contact timestamp does not advance beyond the preceding accepted batch.",
          contact,
          {
            lastConfirmedAtMs: routerState.lastConfirmedAtMs,
          },
        ),
      );
      continue;
    }

    const assignment =
      checkedConfiguration.configuration.assignments[contact.fingerId];
    const voice = resolveVoiceIdentity(
      checkedConfiguration.configuration,
      assignment.language,
    );

    const activation = {
      activationId: contact.eventId,
      fingerId: contact.fingerId,
      confirmedAtMs: contact.confirmedAtMs,
      text: assignment.text,
      language: assignment.language,
      voiceIdentity: voice.voiceIdentity,
    };

    activations.push(activation);
    lastConfirmedAtMs = Math.max(lastConfirmedAtMs, contact.confirmedAtMs);
  }

  const state = {
    lastFrameSequence: batch.frameSequence,
    lastConfirmedAtMs,
    processedEventIds,
  };

  return {
    state,
    activations,
    uiNotifications: activations.map((activation) => ({
      type: "assignment_activated",
      ...activation,
    })),
    speechRequests: activations.map((activation) => ({
      requestId: activation.activationId,
      activationId: activation.activationId,
      fingerId: activation.fingerId,
      confirmedAtMs: activation.confirmedAtMs,
      text: activation.text,
      language: activation.language,
      voiceIdentity: activation.voiceIdentity,
    })),
    rejections,
  };
}

/**
 * Delivers UI notifications first, then starts all speech requests without
 * waiting for an earlier request to settle.
 */
export function dispatchRouteResult(routeResult, sinks) {
  if (
    routeResult === null ||
    typeof routeResult !== "object" ||
    !Array.isArray(routeResult.uiNotifications) ||
    !Array.isArray(routeResult.speechRequests)
  ) {
    throw new TypeError("routeResult must come from routeContactBatch()");
  }

  if (
    sinks === null ||
    typeof sinks !== "object" ||
    typeof sinks.onActivation !== "function" ||
    typeof sinks.speak !== "function"
  ) {
    throw new TypeError("sinks must provide onActivation and speak functions");
  }

  const uiErrors = [];
  for (const notification of routeResult.uiNotifications) {
    try {
      sinks.onActivation(notification);
    } catch (cause) {
      uiErrors.push({
        notification,
        cause,
      });
    }
  }

  const speechTasks = routeResult.speechRequests.map((request) => {
    try {
      return Promise.resolve(sinks.speak(request));
    } catch (cause) {
      return Promise.reject(cause);
    }
  });

  return {
    uiErrors,
    speechSettled: Promise.allSettled(speechTasks),
  };
}

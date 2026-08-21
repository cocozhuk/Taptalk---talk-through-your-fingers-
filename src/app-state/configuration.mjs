import {
  FINGER_IDS,
  VOICE_IDENTITIES,
  isFingerId,
  isLanguage,
  isVoicePreference,
} from "./constants.mjs";
import { validateExpression } from "./validation.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function error(code, message, details = undefined) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function hasExactlyKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

export function cloneConfiguration(configuration) {
  return {
    assignments: Object.fromEntries(
      FINGER_IDS.map((fingerId) => [
        fingerId,
        {
          text: configuration.assignments[fingerId].text,
          language: configuration.assignments[fingerId].language,
        },
      ]),
    ),
    voicePreferences: {
      en: configuration.voicePreferences.en,
      zh: configuration.voicePreferences.zh,
    },
  };
}

/**
 * Fully validates a configuration and returns a normalized copy.
 */
export function validateConfiguration(candidate) {
  if (!isRecord(candidate)) {
    return error("invalid_configuration", "Configuration must be an object.");
  }

  if (!isRecord(candidate.assignments)) {
    return error(
      "invalid_configuration",
      "Configuration assignments must be an object.",
    );
  }

  if (!hasExactlyKeys(candidate.assignments, FINGER_IDS)) {
    return error(
      "invalid_configuration",
      "Configuration must contain exactly the eight TapTalk finger assignments.",
    );
  }

  const assignments = {};

  for (const fingerId of FINGER_IDS) {
    const assignment = candidate.assignments[fingerId];
    if (
      !isRecord(assignment) ||
      typeof assignment.text !== "string" ||
      !isLanguage(assignment.language)
    ) {
      return error(
        "invalid_assignment",
        `Assignment for ${fingerId} has an invalid shape.`,
        { fingerId },
      );
    }

    const validatedExpression = validateExpression(assignment.text);
    if (!validatedExpression.ok) {
      return error(
        "invalid_assignment",
        `Assignment for ${fingerId} is invalid: ${validatedExpression.error.message}`,
        {
          fingerId,
          validationError: validatedExpression.error,
        },
      );
    }

    if (
      validatedExpression.value.text.length > 0 &&
      validatedExpression.value.language !== assignment.language
    ) {
      return error(
        "assignment_language_mismatch",
        `Assignment for ${fingerId} does not match its stored language.`,
        {
          fingerId,
          detectedLanguage: validatedExpression.value.language,
          storedLanguage: assignment.language,
        },
      );
    }

    assignments[fingerId] = {
      text: validatedExpression.value.text,
      language:
        validatedExpression.value.text.length > 0
          ? validatedExpression.value.language
          : assignment.language,
    };
  }

  if (
    !isRecord(candidate.voicePreferences) ||
    !hasExactlyKeys(candidate.voicePreferences, ["en", "zh"]) ||
    !isVoicePreference(candidate.voicePreferences.en) ||
    !isVoicePreference(candidate.voicePreferences.zh)
  ) {
    return error(
      "invalid_voice_preferences",
      "Voice preferences must define masculine or feminine for English and Mandarin.",
    );
  }

  return {
    ok: true,
    configuration: {
      assignments,
      voicePreferences: {
        en: candidate.voicePreferences.en,
        zh: candidate.voicePreferences.zh,
      },
    },
  };
}

export function updateAssignment(configuration, fingerId, text) {
  const checkedConfiguration = validateConfiguration(configuration);
  if (!checkedConfiguration.ok) {
    return checkedConfiguration;
  }

  if (!isFingerId(fingerId)) {
    return error("invalid_finger_id", "Unknown TapTalk finger identifier.", {
      fingerId,
    });
  }

  const checkedExpression = validateExpression(text);
  if (!checkedExpression.ok) {
    return checkedExpression;
  }

  const next = cloneConfiguration(checkedConfiguration.configuration);
  const assignment = {
    text: checkedExpression.value.text,
    language:
      checkedExpression.value.text.length > 0
        ? checkedExpression.value.language
        : checkedConfiguration.configuration.assignments[fingerId].language,
  };
  next.assignments[fingerId] = assignment;

  return {
    ok: true,
    configuration: next,
    assignment,
  };
}

export function updateVoicePreference(configuration, language, preference) {
  const checkedConfiguration = validateConfiguration(configuration);
  if (!checkedConfiguration.ok) {
    return checkedConfiguration;
  }

  if (!isLanguage(language)) {
    return error("invalid_language", "Voice language must be English or Mandarin.", {
      language,
    });
  }

  if (!isVoicePreference(preference)) {
    return error(
      "invalid_voice_preference",
      "Voice preference must be masculine or feminine.",
      { preference },
    );
  }

  const next = cloneConfiguration(checkedConfiguration.configuration);
  next.voicePreferences[language] = preference;

  return {
    ok: true,
    configuration: next,
  };
}

export function resolveVoiceIdentity(configuration, language) {
  const checkedConfiguration = validateConfiguration(configuration);
  if (!checkedConfiguration.ok) {
    return checkedConfiguration;
  }

  if (!isLanguage(language)) {
    return error("invalid_language", "Voice language must be English or Mandarin.", {
      language,
    });
  }

  const preference = checkedConfiguration.configuration.voicePreferences[language];
  return {
    ok: true,
    voiceIdentity: VOICE_IDENTITIES[language][preference],
  };
}

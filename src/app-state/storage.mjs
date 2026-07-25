import {
  CONFIGURATION_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  FINGER_IDS,
} from "./constants.mjs";
import {
  cloneConfiguration,
  validateConfiguration,
} from "./configuration.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyKeys(value, expectedKeys) {
  if (!isRecord(value)) {
    return false;
  }

  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function warning(code, message, cause = undefined) {
  return {
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  };
}

function fallbackResult(fallbackConfiguration, warnings) {
  return {
    configuration: cloneConfiguration(fallbackConfiguration),
    source: "fallback",
    warnings,
  };
}

function validateVersion2Shape(value) {
  if (
    !hasExactlyKeys(value, [
      "schemaVersion",
      "assignments",
      "voicePreferences",
    ]) ||
    value.schemaVersion !== CURRENT_SCHEMA_VERSION ||
    !hasExactlyKeys(value.assignments, FINGER_IDS) ||
    !hasExactlyKeys(value.voicePreferences, ["en", "zh"])
  ) {
    return false;
  }

  return FINGER_IDS.every((fingerId) =>
    hasExactlyKeys(value.assignments[fingerId], ["text", "language"]),
  );
}

function validateVersion1Shape(value) {
  if (
    !hasExactlyKeys(value, [
      "schemaVersion",
      "assignments",
      "voicePreferences",
    ]) ||
    value.schemaVersion !== 1 ||
    !hasExactlyKeys(value.assignments, FINGER_IDS) ||
    !hasExactlyKeys(value.voicePreferences, ["english", "mandarin"])
  ) {
    return false;
  }

  return FINGER_IDS.every((fingerId) =>
    hasExactlyKeys(value.assignments[fingerId], ["expression", "language"]),
  );
}

export function toPersistedConfiguration(configuration) {
  const checked = validateConfiguration(configuration);
  if (!checked.ok) {
    return checked;
  }

  return {
    ok: true,
    value: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      assignments: Object.fromEntries(
        FINGER_IDS.map((fingerId) => [
          fingerId,
          {
            text: checked.configuration.assignments[fingerId].text,
            language: checked.configuration.assignments[fingerId].language,
          },
        ]),
      ),
      voicePreferences: {
        en: checked.configuration.voicePreferences.en,
        zh: checked.configuration.voicePreferences.zh,
      },
    },
    configuration: checked.configuration,
  };
}

export function migratePersistedConfiguration(value) {
  if (!isRecord(value) || !Number.isSafeInteger(value.schemaVersion)) {
    return {
      ok: false,
      error: warning(
        "invalid_schema",
        "Stored TapTalk configuration has no valid schema version.",
      ),
    };
  }

  if (value.schemaVersion === CURRENT_SCHEMA_VERSION) {
    if (!validateVersion2Shape(value)) {
      return {
        ok: false,
        error: warning(
          "invalid_schema",
          "Stored TapTalk version-2 configuration has an invalid shape.",
        ),
      };
    }

    const checked = validateConfiguration(value);
    if (!checked.ok) {
      return {
        ok: false,
        error: warning(
          "invalid_configuration",
          checked.error.message,
          checked.error,
        ),
      };
    }

    return {
      ok: true,
      configuration: checked.configuration,
      sourceVersion: CURRENT_SCHEMA_VERSION,
      needsWriteBack: false,
    };
  }

  if (value.schemaVersion === 1) {
    if (!validateVersion1Shape(value)) {
      return {
        ok: false,
        error: warning(
          "invalid_schema",
          "Stored TapTalk version-1 configuration has an invalid shape.",
        ),
      };
    }

    const assignments = {};
    for (const fingerId of FINGER_IDS) {
      const legacyAssignment = value.assignments[fingerId];
      const language =
        legacyAssignment.language === "english"
          ? "en"
          : legacyAssignment.language === "mandarin"
            ? "zh"
            : null;

      if (language === null) {
        return {
          ok: false,
          error: warning(
            "invalid_configuration",
            `Stored TapTalk assignment for ${fingerId} has an unknown language.`,
          ),
        };
      }

      assignments[fingerId] = {
        text: legacyAssignment.expression,
        language,
      };
    }

    const checked = validateConfiguration({
      assignments,
      voicePreferences: {
        en: value.voicePreferences.english,
        zh: value.voicePreferences.mandarin,
      },
    });

    if (!checked.ok) {
      return {
        ok: false,
        error: warning(
          "invalid_configuration",
          checked.error.message,
          checked.error,
        ),
      };
    }

    return {
      ok: true,
      configuration: checked.configuration,
      sourceVersion: 1,
      needsWriteBack: true,
    };
  }

  return {
    ok: false,
    error: warning(
      "unsupported_schema",
      `Stored TapTalk schema version ${value.schemaVersion} is not supported.`,
    ),
  };
}

export function createConfigurationStore(storage, fallbackConfiguration) {
  if (
    storage === null ||
    typeof storage !== "object" ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    throw new TypeError(
      "storage must provide getItem, setItem, and removeItem functions",
    );
  }

  const checkedFallback = validateConfiguration(fallbackConfiguration);
  if (!checkedFallback.ok) {
    throw new TypeError(
      `fallbackConfiguration is invalid: ${checkedFallback.error.message}`,
    );
  }
  const fallback = checkedFallback.configuration;

  return {
    load() {
      let raw;
      try {
        raw = storage.getItem(CONFIGURATION_STORAGE_KEY);
      } catch (cause) {
        return fallbackResult(fallback, [
          warning(
            "storage_read_failed",
            "TapTalk could not read local configuration.",
            cause,
          ),
        ]);
      }

      if (raw === null) {
        return fallbackResult(fallback, []);
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        return fallbackResult(fallback, [
          warning(
            "invalid_json",
            "Stored TapTalk configuration is not valid JSON.",
            cause,
          ),
        ]);
      }

      const migrated = migratePersistedConfiguration(parsed);
      if (!migrated.ok) {
        return fallbackResult(fallback, [migrated.error]);
      }

      const warnings = [];
      if (migrated.needsWriteBack) {
        const persisted = toPersistedConfiguration(migrated.configuration);
        try {
          storage.setItem(
            CONFIGURATION_STORAGE_KEY,
            JSON.stringify(persisted.value),
          );
        } catch (cause) {
          warnings.push(
            warning(
              "migration_write_failed",
              "TapTalk loaded migrated configuration but could not update local storage.",
              cause,
            ),
          );
        }
      }

      return {
        configuration: cloneConfiguration(migrated.configuration),
        source: migrated.needsWriteBack ? "migrated" : "stored",
        warnings,
      };
    },

    save(configuration) {
      const persisted = toPersistedConfiguration(configuration);
      if (!persisted.ok) {
        return persisted;
      }

      try {
        storage.setItem(
          CONFIGURATION_STORAGE_KEY,
          JSON.stringify(persisted.value),
        );
      } catch (cause) {
        return {
          ok: false,
          error: warning(
            "storage_write_failed",
            "TapTalk could not save local configuration.",
            cause,
          ),
        };
      }

      return {
        ok: true,
        configuration: cloneConfiguration(persisted.configuration),
      };
    },

    reset() {
      try {
        storage.removeItem(CONFIGURATION_STORAGE_KEY);
      } catch (cause) {
        return {
          ok: false,
          configuration: cloneConfiguration(fallback),
          error: warning(
            "storage_remove_failed",
            "TapTalk could not remove local configuration.",
            cause,
          ),
        };
      }

      return {
        ok: true,
        configuration: cloneConfiguration(fallback),
      };
    },
  };
}

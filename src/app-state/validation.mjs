const LATIN_SCRIPT = /^\p{Script=Latin}$/u;
const LETTER = /^\p{Letter}$/u;
const HAN_SCRIPT = /^\p{Script=Han}$/u;

const ERROR_MESSAGES = Object.freeze({
  mixed_language:
    "Use one language in this expression. English and Mandarin can be mixed across fingers, but not within one assignment.",
  ambiguous_characters:
    "Use only Latin letters for English or Han characters for Mandarin; punctuation, digits, emoji, and other scripts are not supported yet.",
  english_too_many_words: "English expressions can contain at most five words.",
  mandarin_too_many_characters:
    "Mandarin expressions can contain at most five Chinese characters.",
});

function failure(code) {
  return {
    ok: false,
    error: {
      code,
      message: ERROR_MESSAGES[code],
    },
  };
}

function isLatinLetter(character) {
  return LETTER.test(character) && LATIN_SCRIPT.test(character);
}

function isHanCharacter(character) {
  return HAN_SCRIPT.test(character);
}

/**
 * Classifies and validates one TapTalk expression.
 *
 * @param {unknown} input
 * @returns {{
 *   ok: true,
 *   value: { text: string, language: "en" | "zh", unitCount: number }
 * } | {
 *   ok: false,
 *   error: { code: string, message: string }
 * }}
 */
export function validateExpression(input) {
  if (typeof input !== "string") {
    return failure("ambiguous_characters");
  }

  const normalized = input.normalize("NFC").trim();
  if (normalized.length === 0) {
    return {
      ok: true,
      value: {
        text: "",
        language: "en",
        unitCount: 0,
      },
    };
  }

  const characters = Array.from(normalized);
  const containsLatin = characters.some(isLatinLetter);
  const containsHan = characters.some(isHanCharacter);

  if (containsLatin && containsHan) {
    return failure("mixed_language");
  }

  if (characters.every(isHanCharacter)) {
    if (characters.length > 5) {
      return failure("mandarin_too_many_characters");
    }

    return {
      ok: true,
      value: {
        text: normalized,
        language: "zh",
        unitCount: characters.length,
      },
    };
  }

  const words = normalized.split(/\s+/u);
  const isEnglish = words.every(
    (word) => word.length > 0 && Array.from(word).every(isLatinLetter),
  );

  if (!isEnglish) {
    return failure("ambiguous_characters");
  }

  if (words.length > 5) {
    return failure("english_too_many_words");
  }

  return {
    ok: true,
    value: {
      text: words.join(" "),
      language: "en",
      unitCount: words.length,
    },
  };
}

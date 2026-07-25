# TapTalk Decision Log

## Accepted baseline decisions

| Decision | Rule |
|---|---|
| Mandarin length | One Chinese character counts as one word/unit. |
| Language assignment | Each finger has one expression in one language. Different fingers may use different languages. |
| Concurrent contacts | First confirmed contact is dispatched first. |
| Speech concurrency | Playback may overlap. |
| Storage | Configuration remains on the user's device. |
| Latency | Audible onset must target no more than 500 ms after confirmed contact. |

## Provisional implementation interpretations

These interpretations support the first prototype but require Product
Architecture review:

- Mixed English and Mandarin lexical content inside one expression is rejected.
- English and Mandarin each retain a masculine/feminine voice preference.
- Ambiguous punctuation, digit, emoji, or script input is rejected until a
  clearer validation policy is approved.
- Contacts confirmed in the same frame use a stable finger-ID tie-break.


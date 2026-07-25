export type FingerId =
  | "left_index"
  | "left_middle"
  | "left_ring"
  | "left_pinky"
  | "right_index"
  | "right_middle"
  | "right_ring"
  | "right_pinky";

export type Language = "en" | "zh";
export type VoicePreference = "masculine" | "feminine";
export type VoiceIdentity =
  | "en_masculine"
  | "en_feminine"
  | "zh_masculine"
  | "zh_feminine";

export interface Assignment {
  text: string;
  language: Language;
}

export interface Configuration {
  assignments: Record<FingerId, Assignment>;
  voicePreferences: Record<Language, VoicePreference>;
}

export type ValidationErrorCode =
  | "empty"
  | "mixed_language"
  | "ambiguous_characters"
  | "english_too_many_words"
  | "mandarin_too_many_characters";

export interface CoreError {
  code: string;
  message: string;
  details?: unknown;
}

export type ExpressionValidationResult =
  | {
      ok: true;
      value: {
        text: string;
        language: Language;
        unitCount: number;
      };
    }
  | {
      ok: false;
      error: CoreError & { code: ValidationErrorCode };
    };

export type ConfigurationValidationResult =
  | {
      ok: true;
      configuration: Configuration;
    }
  | {
      ok: false;
      error: CoreError;
    };

export interface ContactConfirmation {
  eventId: string;
  fingerId: FingerId;
  confirmedAtMs: number;
}

export interface ContactBatch {
  frameSequence: number;
  contacts: ContactConfirmation[];
}

export interface RouterState {
  lastFrameSequence: number;
  lastConfirmedAtMs: number;
  processedEventIds: ReadonlySet<string>;
}

export interface Activation {
  activationId: string;
  fingerId: FingerId;
  confirmedAtMs: number;
  text: string;
  language: Language;
  voiceIdentity: VoiceIdentity;
}

export interface UiNotification extends Activation {
  type: "assignment_activated";
}

export interface SpeechRequest {
  requestId: string;
  activationId: string;
  fingerId: FingerId;
  confirmedAtMs: number;
  text: string;
  language: Language;
  voiceIdentity: VoiceIdentity;
}

export type RoutingRejectionReason =
  | "invalid_configuration"
  | "malformed_batch"
  | "stale_batch"
  | "malformed_contact"
  | "duplicate_event"
  | "duplicate_finger"
  | "stale_event";

export interface RoutingRejection {
  reason: RoutingRejectionReason;
  message: string;
  input: unknown;
  details?: unknown;
}

export interface RouteResult {
  state: RouterState;
  activations: Activation[];
  uiNotifications: UiNotification[];
  speechRequests: SpeechRequest[];
  rejections: RoutingRejection[];
}

export interface DispatchSinks {
  onActivation(notification: UiNotification): void;
  speak(request: SpeechRequest): unknown | PromiseLike<unknown>;
}

export interface DispatchResult {
  uiErrors: Array<{ notification: UiNotification; cause: unknown }>;
  speechSettled: Promise<PromiseSettledResult<unknown>[]>;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageWarning {
  code: string;
  message: string;
  cause?: unknown;
}

export interface LoadResult {
  configuration: Configuration;
  source: "fallback" | "stored" | "migrated";
  warnings: StorageWarning[];
}

export interface SaveSuccess {
  ok: true;
  configuration: Configuration;
}

export interface SaveFailure {
  ok: false;
  error: CoreError | StorageWarning;
}

export interface ConfigurationStore {
  load(): LoadResult;
  save(configuration: Configuration): SaveSuccess | SaveFailure;
  reset():
    | { ok: true; configuration: Configuration }
    | {
        ok: false;
        configuration: Configuration;
        error: StorageWarning;
      };
}

export const FINGER_IDS: readonly FingerId[];
export const LANGUAGES: readonly Language[];
export const VOICE_PREFERENCES: readonly VoicePreference[];
export const VOICE_IDENTITIES: Readonly<
  Record<Language, Readonly<Record<VoicePreference, VoiceIdentity>>>
>;
export const CONFIGURATION_STORAGE_KEY: "taptalk.configuration";
export const CURRENT_SCHEMA_VERSION: 2;

export function isFingerId(value: unknown): value is FingerId;
export function isLanguage(value: unknown): value is Language;
export function isVoicePreference(value: unknown): value is VoicePreference;

export function validateExpression(input: unknown): ExpressionValidationResult;
export function cloneConfiguration(configuration: Configuration): Configuration;
export function validateConfiguration(
  candidate: unknown,
): ConfigurationValidationResult;
export function updateAssignment(
  configuration: Configuration,
  fingerId: unknown,
  text: unknown,
):
  | {
      ok: true;
      configuration: Configuration;
      assignment: Assignment;
    }
  | { ok: false; error: CoreError };
export function updateVoicePreference(
  configuration: Configuration,
  language: unknown,
  preference: unknown,
):
  | { ok: true; configuration: Configuration }
  | { ok: false; error: CoreError };
export function resolveVoiceIdentity(
  configuration: Configuration,
  language: unknown,
):
  | { ok: true; voiceIdentity: VoiceIdentity }
  | { ok: false; error: CoreError };

export function createRouterState(): RouterState;
export function routeContactBatch(
  routerState: RouterState,
  configuration: Configuration,
  batch: unknown,
): RouteResult;
export function dispatchRouteResult(
  routeResult: RouteResult,
  sinks: DispatchSinks,
): DispatchResult;

export function toPersistedConfiguration(
  configuration: Configuration,
):
  | {
      ok: true;
      value: unknown;
      configuration: Configuration;
    }
  | { ok: false; error: CoreError };
export function migratePersistedConfiguration(value: unknown):
  | {
      ok: true;
      configuration: Configuration;
      sourceVersion: 1 | 2;
      needsWriteBack: boolean;
    }
  | { ok: false; error: StorageWarning };
export function createConfigurationStore(
  storage: StorageAdapter,
  fallbackConfiguration: Configuration,
): ConfigurationStore;

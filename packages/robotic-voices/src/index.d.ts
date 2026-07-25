export type TapTalkLanguage = "en" | "zh";
export type VoiceGender = "masculine" | "feminine";
export type VoiceIdentityId =
  | "en-masculine"
  | "en-feminine"
  | "zh-masculine"
  | "zh-feminine";

export interface VoiceIdentity {
  readonly id: VoiceIdentityId;
  readonly language: TapTalkLanguage;
  readonly gender: VoiceGender;
  readonly processing: {
    readonly dryGain: number;
    readonly wetGain: number;
    readonly ringFrequencyHz: number;
    readonly bandpassFrequencyHz: number;
    readonly bandpassQ: number;
  };
}

export interface PcmAudio {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}

export interface SpeechBackend {
  readonly revision?: string;
  warmUp?(input: { readonly identities: readonly VoiceIdentityId[] }): Promise<void> | void;
  synthesize(input: {
    readonly text: string;
    readonly identity: VoiceIdentityId;
  }): Promise<PcmAudio> | PcmAudio;
  dispose?(): Promise<void> | void;
}

export interface SpeechPreparation {
  readonly text: string;
  readonly language: TapTalkLanguage;
  readonly gender: VoiceGender;
}

export interface SpeechRequest extends SpeechPreparation {
  readonly requestId: string;
  /** Must share performance.now()'s time origin. */
  readonly confirmedAtMs: number;
  readonly signal?: AbortSignal;
}

export interface OnsetMeasurement {
  readonly requestId: string;
  readonly identity: VoiceIdentityId;
  readonly confirmedAtMs: number;
  readonly onsetAtMs: number;
  readonly latencyMs: number;
  readonly basis: string;
}

export interface LatencySnapshot {
  readonly basis: string;
  readonly count: number;
  readonly targetMs: number;
  readonly medianMs: number | null;
  readonly p95Ms: number | null;
  readonly maxMs: number | null;
  readonly withinTargetRatio: number | null;
}

export interface PlaybackHandle {
  readonly requestId: string;
  readonly identity: VoiceIdentityId;
  readonly onset: OnsetMeasurement;
  readonly cacheStatus: "hit" | "miss" | "shared";
  readonly ended: Promise<{
    readonly requestId: string;
    readonly identity: VoiceIdentityId;
    readonly reason: "ended" | "stopped";
  }>;
  stop(): void;
}

export type SpeechEvent =
  | {
      readonly type: "speech-requested";
      readonly requestId: string;
      readonly identity: VoiceIdentityId;
      readonly confirmedAtMs: number;
    }
  | {
      readonly type: "speech-scheduled";
      readonly requestId: string;
      readonly identity: VoiceIdentityId;
      readonly cacheStatus: "hit" | "miss" | "shared";
      readonly onset: OnsetMeasurement;
    }
  | {
      readonly type: "speech-ended";
      readonly requestId: string;
      readonly identity: VoiceIdentityId;
      readonly reason: "ended" | "stopped";
    }
  | {
      readonly type: "speech-failed";
      readonly requestId?: string;
      readonly identity?: VoiceIdentityId;
      readonly code: string;
      readonly message: string;
    };

export class TapTalkSpeechError extends Error {
  readonly code: string;
}

export class LatencyTracker {
  constructor(options?: { maxSamples?: number; targetMs?: number });
  record(input: {
    requestId: string;
    identity: VoiceIdentityId;
    confirmedAtMs: number;
    onsetAtMs: number;
    basis: string;
  }): OnsetMeasurement;
  snapshot(options?: { basis?: string }): LatencySnapshot;
  samples(options?: { basis?: string }): readonly OnsetMeasurement[];
}

export const ESTIMATED_ONSET_BASIS: "estimated-output";
export const VOICE_IDENTITIES: Readonly<Record<VoiceIdentityId, VoiceIdentity>>;
export const VOICE_IDENTITY_IDS: readonly VoiceIdentityId[];

export function routeVoiceIdentity(
  language: TapTalkLanguage,
  gender: VoiceGender,
): VoiceIdentity;

export function createWorkerPcmBackend(options: {
  worker: Pick<
    Worker,
    "postMessage" | "addEventListener" | "removeEventListener" | "terminate"
  >;
  speakers: Readonly<Record<VoiceIdentityId, unknown>>;
  revision?: string;
  terminateOnDispose?: boolean;
}): SpeechBackend;

export function createTapTalkSpeech(options: {
  backend: SpeechBackend;
  audioContext: AudioContext;
  clock?: Pick<Performance, "now">;
  onEvent?: (event: SpeechEvent) => void;
  cacheOptions?: { maxBytes?: number; maxEntries?: number };
  startLeadSeconds?: number;
  latencyTracker?: LatencyTracker;
}): {
  warmUp(preparations?: readonly SpeechPreparation[]): Promise<
    readonly {
      identity: VoiceIdentityId;
      cacheStatus: "hit" | "miss" | "shared";
      durationMs: number;
    }[]
  >;
  unlock(): Promise<boolean>;
  prepare(preparation: SpeechPreparation): Promise<{
    identity: VoiceIdentityId;
    cacheStatus: "hit" | "miss" | "shared";
    durationMs: number;
  }>;
  speak(request: SpeechRequest): Promise<PlaybackHandle>;
  recordAudibleOnset(input: {
    requestId: string;
    audibleAtMs: number;
    basis?: string;
    confirmedAtMs?: number;
    identity?: VoiceIdentityId;
  }): OnsetMeasurement;
  latencySnapshot(options?: { basis?: string }): LatencySnapshot;
  cacheSnapshot(): {
    entries: number;
    sizeBytes: number;
    maxBytes: number;
    maxEntries: number;
  };
  activePlaybackCount(): number;
  dispose(): Promise<void>;
};

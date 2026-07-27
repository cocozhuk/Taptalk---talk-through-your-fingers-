import { LocalAudioVoicePort } from "./local-audio-voice.js";
import { WebSpeechVoicePort } from "./web-speech-voice.js";

export class CapturableWebSpeechVoicePort {
  constructor({
    liveVoice = new WebSpeechVoicePort(),
    recordingVoice = new LocalAudioVoicePort({
      connectToSpeakers: false,
    }),
  } = {}) {
    this.liveVoice = liveVoice;
    this.recordingVoice = recordingVoice;
    this.usesBrowserSpeech = Boolean(
      liveVoice.speechSynthesis && liveVoice.Utterance,
    );
    if (!this.usesBrowserSpeech) {
      this.recordingVoice.connectToSpeakers = true;
    }
  }

  get recordingStream() {
    return this.recordingVoice.recordingStream;
  }

  warmAssignments(assignments) {
    return this.recordingVoice.warmAssignments(assignments);
  }

  speak(request) {
    if (!this.usesBrowserSpeech) {
      return this.recordingVoice.speak(request);
    }

    void this.recordingVoice
      .speak({
        activationId: request.activationId,
        fingerId: request.fingerId,
        text: request.text,
        voiceId: request.voiceId,
      })
      .catch(() => {
        // The browser voice remains authoritative for live output. Capture
        // failures are reported by recorder validation, not as duplicate
        // speech errors.
      });
    return this.liveVoice.speak(request);
  }

  interrupt(request) {
    const liveInterrupted = this.liveVoice.interrupt(request);
    const recordingInterrupted = this.recordingVoice.interrupt(request);
    return liveInterrupted || recordingInterrupted;
  }

  destroy() {
    this.recordingVoice.destroy();
  }
}

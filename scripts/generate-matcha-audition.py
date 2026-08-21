import os
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = Path(
    os.environ.get(
        "MATCHA_MODEL_ROOT",
        "/tmp/taptalk-matcha-model/matcha-icefall-zh-baker",
    )
)
VOCODER_PATH = Path(
    os.environ.get(
        "MATCHA_VOCODER_PATH",
        "/tmp/taptalk-matcha-model/vocos-22khz-univ.onnx",
    )
)
WORDS = {
    "ta": "他",
    "lai": "来",
    "ni": "你",
    "qu": "去",
    "ma": "吗",
    "wo": "我",
}


def write_wav(path, samples, sample_rate):
    pcm = np.clip(samples, -1.0, 1.0)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())


def soften_edges(samples, sample_rate, padding_seconds=0.03):
    samples = np.asarray(samples, dtype=np.float32).copy()
    fade_length = min(round(sample_rate * 0.012), len(samples) // 2)

    if fade_length:
        fade = np.linspace(0, 1, fade_length, dtype=np.float32)
        samples[:fade_length] *= fade
        samples[-fade_length:] *= fade[::-1]

    padding = np.zeros(
        round(sample_rate * padding_seconds),
        dtype=np.float32,
    )
    return np.concatenate((padding, samples, padding))


def find_quiet_spans(samples, sample_rate):
    frame_length = max(1, round(sample_rate * 0.012))
    energy = np.sqrt(
        np.convolve(
            np.square(samples, dtype=np.float32),
            np.ones(frame_length, dtype=np.float32) / frame_length,
            mode="same",
        )
    )
    threshold = max(0.002, float(energy.max()) * 0.055)
    quiet = energy < threshold
    minimum_length = round(sample_rate * 0.055)
    spans = []
    start = None

    for index, is_quiet in enumerate(quiet):
        if is_quiet and start is None:
            start = index
        elif not is_quiet and start is not None:
            if index - start >= minimum_length:
                spans.append((start, index))
            start = None

    if start is not None and len(quiet) - start >= minimum_length:
        spans.append((start, len(quiet)))

    edge = round(sample_rate * 0.08)
    return [
        span
        for span in spans
        if span[0] > edge and span[1] < len(samples) - edge
    ]


def isolate_middle_expression(samples, sample_rate):
    quiet_spans = find_quiet_spans(samples, sample_rate)
    candidates = []

    for first_index, first in enumerate(quiet_spans):
        for second in quiet_spans[first_index + 1 :]:
            duration = (second[0] - first[1]) / sample_rate
            if 0.12 <= duration <= 1.2:
                first_position = ((first[0] + first[1]) / 2) / len(samples)
                second_position = ((second[0] + second[1]) / 2) / len(samples)
                position_score = abs(first_position - 0.38) + abs(
                    second_position - 0.64
                )
                candidates.append((position_score, first, second))

    if not candidates:
        raise RuntimeError("Could not find two reliable pauses around the target")

    _, first, second = min(candidates, key=lambda candidate: candidate[0])
    margin = round(sample_rate * 0.018)
    start = max(0, first[1] - margin)
    end = min(len(samples), second[0] + margin)
    return soften_edges(
        samples[start:end],
        sample_rate,
        padding_seconds=0.15,
    )


def main():
    output_directory = PROJECT_ROOT / "assets" / "voice-audition"
    output_directory.mkdir(parents=True, exist_ok=True)

    matcha = sherpa_onnx.OfflineTtsMatchaModelConfig(
        acoustic_model=str(MODEL_ROOT / "model-steps-3.onnx"),
        vocoder=str(VOCODER_PATH),
        lexicon=str(MODEL_ROOT / "lexicon.txt"),
        tokens=str(MODEL_ROOT / "tokens.txt"),
    )
    model = sherpa_onnx.OfflineTtsModelConfig(
        matcha=matcha,
        num_threads=2,
        provider="cpu",
    )
    rules = ",".join(
        str(MODEL_ROOT / filename)
        for filename in ("phone.fst", "date.fst", "number.fst")
    )
    tts = sherpa_onnx.OfflineTts(
        sherpa_onnx.OfflineTtsConfig(
            model=model,
            rule_fsts=rules,
            max_num_sentences=1,
        )
    )

    for slug, text in WORDS.items():
        direct_audio = tts.generate(text, sid=0, speed=1.0)
        direct_samples = soften_edges(
            direct_audio.samples,
            direct_audio.sample_rate,
        )
        write_wav(
            output_directory / f"matcha-direct-{slug}.wav",
            direct_samples,
            direct_audio.sample_rate,
        )

        context_audio = tts.generate(
            f"开始，{text}，结束。",
            sid=0,
            speed=1.0,
        )
        context_samples = isolate_middle_expression(
            np.asarray(context_audio.samples, dtype=np.float32),
            context_audio.sample_rate,
        )
        write_wav(
            output_directory / f"matcha-context-{slug}.wav",
            context_samples,
            context_audio.sample_rate,
        )


if __name__ == "__main__":
    main()

import base64
import io
import json
import sys
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = PROJECT_ROOT / "models" / "matcha-zh-baker"
CONTEXT_PADDING_SECONDS = 0.15
EDGE_FADE_SECONDS = 0.012
CROP_MARGIN_SECONDS = 0.018


def is_single_han_character(text):
    return len(text) == 1 and "\u3400" <= text <= "\u9fff"


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
    minimum_length = round(sample_rate * 0.055)
    spans = []
    start = None

    for index, quiet in enumerate(energy < threshold):
        if quiet and start is None:
            start = index
        elif not quiet and start is not None:
            if index - start >= minimum_length:
                spans.append((start, index))
            start = None

    if start is not None and len(energy) - start >= minimum_length:
        spans.append((start, len(energy)))

    edge = round(sample_rate * 0.08)
    return [
        span
        for span in spans
        if span[0] > edge and span[1] < len(samples) - edge
    ]


def isolate_character(samples, sample_rate):
    spans = find_quiet_spans(samples, sample_rate)
    candidates = []

    for first_index, first in enumerate(spans):
        for second in spans[first_index + 1 :]:
            duration = (second[0] - first[1]) / sample_rate
            if 0.12 <= duration <= 1.2:
                first_position = ((first[0] + first[1]) / 2) / len(samples)
                second_position = ((second[0] + second[1]) / 2) / len(samples)
                score = abs(first_position - 0.38) + abs(
                    second_position - 0.64
                )
                candidates.append((score, first, second))

    if not candidates:
        raise RuntimeError(
            "Matcha could not isolate this one-character expression."
        )

    _, first, second = min(candidates, key=lambda candidate: candidate[0])
    margin = round(sample_rate * CROP_MARGIN_SECONDS)
    start = max(0, first[1] - margin)
    end = min(len(samples), second[0] + margin)
    cropped = np.asarray(samples[start:end], dtype=np.float32).copy()

    fade_length = min(
        round(sample_rate * EDGE_FADE_SECONDS),
        len(cropped) // 2,
    )
    if fade_length:
        fade = np.linspace(0, 1, fade_length, dtype=np.float32)
        cropped[:fade_length] *= fade
        cropped[-fade_length:] *= fade[::-1]

    padding = np.zeros(
        round(sample_rate * CONTEXT_PADDING_SECONDS),
        dtype=np.float32,
    )
    return np.concatenate((padding, cropped, padding))


def encode_wave(samples, sample_rate):
    normalized = np.clip(samples, -1, 1)
    pcm = np.where(
        normalized < 0,
        normalized * 32768,
        normalized * 32767,
    ).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm.tobytes())
    return output.getvalue()


def create_tts():
    matcha = sherpa_onnx.OfflineTtsMatchaModelConfig(
        acoustic_model=str(MODEL_ROOT / "model-steps-3.onnx"),
        vocoder=str(MODEL_ROOT / "vocos-22khz-univ.onnx"),
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
    return sherpa_onnx.OfflineTts(
        sherpa_onnx.OfflineTtsConfig(
            model=model,
            rule_fsts=rules,
            max_num_sentences=1,
        )
    )


def main():
    tts = create_tts()

    for line in sys.stdin:
        try:
            request = json.loads(line)
            text = request["text"].strip()
            if not text:
                raise ValueError("Mandarin expression is empty")
            input_text = (
                f"开始，{text}，结束。"
                if is_single_han_character(text)
                else text
            )
            audio = tts.generate(input_text, sid=0, speed=1.0)
            samples = (
                isolate_character(audio.samples, audio.sample_rate)
                if is_single_han_character(text)
                else audio.samples
            )
            response = {
                "id": request["id"],
                "audio": base64.b64encode(
                    encode_wave(samples, audio.sample_rate)
                ).decode("ascii"),
            }
        except Exception as error:
            response = {
                "id": request.get("id") if "request" in locals() else None,
                "error": str(error),
            }
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

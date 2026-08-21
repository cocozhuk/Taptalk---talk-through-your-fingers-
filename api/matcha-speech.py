from collections import OrderedDict
import ctypes
from http.server import BaseHTTPRequestHandler
from io import BytesIO
from pathlib import Path
import sys
from threading import Lock
from urllib.parse import parse_qs, urlparse
import wave

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = PROJECT_ROOT / "models" / "matcha-zh-baker"
CONTEXT_PADDING_SECONDS = 0.15
MAX_CACHE_ENTRIES = 64
HAN_RANGES = (
    (0x3400, 0x4DBF),
    (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF),
)

if sys.platform.startswith("linux"):
    ctypes.CDLL(
        str(MODEL_ROOT / "runtime" / "libonnxruntime.so"),
        mode=ctypes.RTLD_GLOBAL,
    )

import numpy as np
import sherpa_onnx


_cache = OrderedDict()
_cache_lock = Lock()
_tts = None
_tts_lock = Lock()


def _is_han_character(character):
    codepoint = ord(character)
    return any(start <= codepoint <= end for start, end in HAN_RANGES)


def _validate_text(value):
    text = value.strip()
    characters = list(text)
    if not 1 <= len(characters) <= 5:
        raise ValueError("Mandarin expressions must contain one to five characters")
    if not all(_is_han_character(character) for character in characters):
        raise ValueError("Only Mandarin Chinese characters are supported")
    return text


def _find_quiet_spans(samples, sample_rate):
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


def _isolate_middle_expression(samples, sample_rate):
    spans = _find_quiet_spans(samples, sample_rate)
    candidates = []

    for first_index, first in enumerate(spans):
        for second in spans[first_index + 1 :]:
            duration = (second[0] - first[1]) / sample_rate
            if 0.12 <= duration <= 1.2:
                first_position = ((first[0] + first[1]) / 2) / len(samples)
                second_position = ((second[0] + second[1]) / 2) / len(samples)
                position_score = abs(first_position - 0.38) + abs(
                    second_position - 0.64
                )
                candidates.append((position_score, first, second))

    if not candidates:
        raise RuntimeError("Could not isolate the Mandarin character")

    _, first, second = min(candidates, key=lambda candidate: candidate[0])
    margin = round(sample_rate * 0.018)
    start = max(0, first[1] - margin)
    end = min(len(samples), second[0] + margin)
    cropped = np.asarray(samples[start:end], dtype=np.float32).copy()

    fade_length = min(round(sample_rate * 0.012), len(cropped) // 2)
    if fade_length:
        fade = np.linspace(0, 1, fade_length, dtype=np.float32)
        cropped[:fade_length] *= fade
        cropped[-fade_length:] *= fade[::-1]

    padding = np.zeros(
        round(sample_rate * CONTEXT_PADDING_SECONDS),
        dtype=np.float32,
    )
    return np.concatenate((padding, cropped, padding))


def _create_tts():
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


def _get_tts():
    global _tts
    if _tts is None:
        _tts = _create_tts()
    return _tts


def _encode_wav(samples, sample_rate):
    pcm = np.clip(samples, -1.0, 1.0)
    pcm = (pcm * 32767).astype("<i2")
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


def _synthesize(text):
    with _cache_lock:
        cached = _cache.get(text)
        if cached is not None:
            _cache.move_to_end(text)
            return cached

    with _tts_lock:
        tts = _get_tts()
        synthesis_text = f"开始，{text}，结束。" if len(text) == 1 else text
        audio = tts.generate(synthesis_text, sid=0, speed=1.0)

    samples = np.asarray(audio.samples, dtype=np.float32)
    if len(text) == 1:
        samples = _isolate_middle_expression(samples, audio.sample_rate)
    encoded = _encode_wav(samples, audio.sample_rate)

    with _cache_lock:
        _cache[text] = encoded
        _cache.move_to_end(text)
        while len(_cache) > MAX_CACHE_ENTRIES:
            _cache.popitem(last=False)
    return encoded


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            text = _validate_text(query.get("text", [""])[0])
            audio = _synthesize(text)
            self.send_response(200)
            self.send_header("Cache-Control", "private, max-age=3600")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Content-Type", "audio/wav")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(audio)
        except ValueError as error:
            self._send_text(400, str(error))
        except Exception:
            self._send_text(500, "TapTalk Mandarin synthesis failed")

    def _send_text(self, status, message):
        body = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

from pathlib import Path

import soundfile as sf
from kokoro import KModel, KPipeline


REPO_ID = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24_000
VOICES = ("zf_xiaobei", "zf_xiaoxiao", "zf_xiaoyi")
WORDS = {
    "ni": "你。",
    "wo": "我。",
    "nihao": "你好。",
}


def main():
    output_directory = (
        Path(__file__).resolve().parents[1] / "assets" / "voice-audition"
    )
    output_directory.mkdir(parents=True, exist_ok=True)

    model = KModel(repo_id=REPO_ID).to("cpu").eval()
    pipeline = KPipeline(
        lang_code="z",
        repo_id=REPO_ID,
        model=model,
    )

    for voice in VOICES:
        for slug, text in WORDS.items():
            result = next(pipeline(text, voice=voice, speed=1.0))
            audio = result.audio.detach().cpu().numpy()
            sf.write(
                output_directory / f"{voice}-{slug}.wav",
                audio,
                SAMPLE_RATE,
            )


if __name__ == "__main__":
    main()

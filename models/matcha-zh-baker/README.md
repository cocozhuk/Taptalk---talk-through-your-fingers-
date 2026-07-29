# Matcha Chinese Baker model

This directory contains the Mandarin model used by the TapTalk desktop worker
and hosted Vercel function.

- Acoustic model: `matcha-icefall-zh-baker`
- Vocoder: `vocos-22khz-univ.onnx`
- Runtime: `sherpa-onnx`
- Hosted runtime library: `runtime/libonnxruntime.so`, extracted unchanged
  from the official `sherpa-onnx-core==1.13.4` Linux wheel because Vercel's
  dependency optimizer does not retain this dynamically loaded file.
- Upstream model source:
  <https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models>
- Training code:
  <https://github.com/k2-fsa/icefall/tree/master/egs/baker_zh/TTS>
- Dataset:
  <https://en.data-baker.com/datasets/freeDatasets/>

The upstream model README states that the Baker dataset contains 10,000
Chinese sentences from a native female speaker and is for
**non-commercial use only**. TapTalk therefore treats this model as a
non-commercial prototype dependency. Replace it with a commercially cleared
model or commissioned voice before any commercial release.

One-character Mandarin expressions are synthesized inside the fixed carrier
`开始，{character}，结束`, cropped between its pauses, edge-faded, and padded
with 150 ms of silence on each side. Two-to-five-character expressions are
synthesized directly.

// On-device neural TTS (Kokoro via transformers.js/ONNX). Produces a real .wav on any modern browser, including phones.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";

const $ = id => document.getElementById(id);
const btn = $("dlOffline"), prog = $("prog"), player = $("player"), link = $("saveLink"), status = $("status");
let tts = null, lastUrl = null;

function wavBlob(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true));
  return new Blob([buf], { type: "audio/wav" });
}

function chunks(text) {
  const parts = text.match(/[^.!?\n]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [];
  const out = []; let cur = "";
  for (const p of parts) { if ((cur + " " + p).length > 250 && cur) { out.push(cur); cur = p; } else cur = (cur + " " + p).trim(); }
  if (cur) out.push(cur);
  return out;
}

btn.addEventListener("click", async () => {
  const text = $("text").value.trim();
  if (!text) return (status.textContent = "Please enter some text first.");
  btn.disabled = true; prog.hidden = false; prog.value = 0; link.hidden = player.hidden = true;
  try {
    if (!tts) {
      status.textContent = "Downloading voice model (first time only)...";
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8", device: "wasm",
        progress_callback: p => { if (p.status === "progress") prog.value = Math.round(p.progress) * 0.5; }
      });
    }
    const parts = chunks(text), pcs = []; let rate = 24000, total = 0;
    for (let i = 0; i < parts.length; i++) {
      status.textContent = `Generating audio ${i + 1}/${parts.length}...`;
      const a = await tts.generate(parts[i], { voice: "af_heart", speed: +$("rate").value });
      rate = a.sampling_rate; pcs.push(a.audio); total += a.audio.length;
      prog.value = 50 + ((i + 1) / parts.length) * 50;
    }
    const all = new Float32Array(total); let o = 0;
    pcs.forEach(p => { all.set(p, o); o += p.length; });
    const blob = wavBlob(all, rate);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    player.src = lastUrl; link.href = lastUrl; link.download = "text-to-speech.wav";
    player.hidden = link.hidden = false;
    status.textContent = "Done! Tap Save audio file below.";
  } catch (e) {
    console.error(e);
    status.textContent = "Couldn't generate audio: " + (e.message || e) + ". Check your connection and try again.";
  } finally { btn.disabled = false; prog.hidden = true; }
});

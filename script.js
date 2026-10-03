const $ = id => document.getElementById(id);
const synth = window.speechSynthesis;
const textEl = $("text"), voiceEl = $("voice"), statusEl = $("status");
let voices = [];
let recorder = null;

const say = m => (statusEl.textContent = m);

function loadVoices() {
  voices = synth.getVoices();
  if (!voices.length) return;
  const prev = voiceEl.value;
  voiceEl.innerHTML = "";
  voices.forEach((v, i) => voiceEl.add(new Option(`${v.name} (${v.lang})`, i)));
  if (prev && voices[prev]) voiceEl.value = prev;
  else {
    const def = voices.findIndex(v => v.default);
    voiceEl.value = def >= 0 ? def : 0;
  }
}
loadVoices();
synth.onvoiceschanged = loadVoices;
if (!synth) say("Speech synthesis is not supported in this browser.");

textEl.addEventListener("input", () => ($("count").textContent = textEl.value.length));
$("rate").addEventListener("input", e => ($("rateV").textContent = (+e.target.value).toFixed(1)));
$("pitch").addEventListener("input", e => ($("pitchV").textContent = (+e.target.value).toFixed(1)));

function setPlaying(on) {
  $("pause").disabled = $("stop").disabled = !on;
  $("play").disabled = on;
  if (!on) $("pause").textContent = "⏸ Pause";
}

// split into sentence chunks so Chrome doesn't cut off long text
function chunks(text) {
  return text.match(/[^.!?\n]+[.!?]*\s*/g)?.map(s => s.trim()).filter(Boolean) || [];
}

function speak(onDone) {
  const text = textEl.value.trim();
  if (!text) { say("Please enter some text first."); return false; }
  synth.cancel();
  const parts = chunks(text);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.voice = voices[voiceEl.value];
    u.rate = +$("rate").value;
    u.pitch = +$("pitch").value;
    if (i === parts.length - 1) {
      u.onend = () => { setPlaying(false); say(""); onDone && onDone(); };
    }
    u.onerror = e => { if (e.error !== "canceled" && e.error !== "interrupted") say("Error: " + e.error); };
    synth.speak(u);
  });
  setPlaying(true);
  say("Speaking...");
  return true;
}

$("play").addEventListener("click", () => speak());
$("pause").addEventListener("click", () => {
  if (synth.paused) { synth.resume(); $("pause").textContent = "⏸ Pause"; say("Speaking..."); }
  else { synth.pause(); $("pause").textContent = "▶ Resume"; say("Paused"); }
});
$("stop").addEventListener("click", () => {
  synth.cancel();
  if (recorder && recorder.state !== "inactive") recorder.stop();
  setPlaying(false); say("Stopped");
});

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("dlText").addEventListener("click", () => {
  const t = textEl.value.trim();
  if (!t) return say("Nothing to download. Enter some text first.");
  download(new Blob([t], { type: "text/plain" }), "text-to-speech.txt");
  say("Text downloaded.");
});

// Web Speech API can't export audio, so we record the tab's own audio output.
$("dlAudio").addEventListener("click", async () => {
  if (!textEl.value.trim()) return say("Please enter some text first.");
  if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined")
    return say("Audio recording isn't supported here. Use Chrome or Edge on desktop.");
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true });
  } catch { return say("Recording cancelled."); }
  const track = stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach(t => t.stop());
    return say("No audio shared. Choose 'This tab' and tick 'Share tab audio'.");
  }
  stream.getVideoTracks().forEach(t => t.stop());
  const data = [];
  recorder = new MediaRecorder(new MediaStream([track]));
  recorder.ondataavailable = e => e.data.size && data.push(e.data);
  recorder.onstop = () => {
    track.stop();
    if (data.length) { download(new Blob(data, { type: "audio/webm" }), "text-to-speech.webm"); say("Audio downloaded (.webm)."); }
  };
  recorder.start();
  speak(() => setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 400));
  say("Recording... keep this tab open until it finishes.");
});

// Phones can't capture tab audio, so hide that button there.
if (!navigator.mediaDevices?.getDisplayMedia) $("dlAudio").hidden = true;

let audioContext: AudioContext | undefined;

export function armWelcomeAudio() {
  if (!window.AudioContext) return;
  audioContext ??= new AudioContext();
  void audioContext.resume().catch(() => {});
}

function chime() {
  if (!audioContext || audioContext.state !== 'running') return;
  const context = audioContext;
  const start = context.currentTime;
  [220, 329.63, 440, 554.37, 659.25, 880].forEach((frequency, index) => {
    const note = context.createOscillator();
    const envelope = context.createGain();
    const at = start + index * 0.14;
    note.type = index < 2 ? 'triangle' : 'sine';
    note.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.001, at);
    envelope.gain.exponentialRampToValueAtTime(0.075, at + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
    note.connect(envelope).connect(context.destination);
    note.start(at);
    note.stop(at + 1.2);
  });
}

export function playWelcomeMusic(custom: boolean) {
  if (!custom) {
    chime();
    return;
  }
  const audio = new Audio('/api/wake-music');
  audio.volume = 0.16;
  void audio.play().then(() => {
    window.setTimeout(() => audio.pause(), 7000);
  }).catch(chime);
}

export async function readWelcomeWeather(signal: AbortSignal) {
  const response = await fetch('/api/weather', { signal });
  if (!response.ok) return null;
  const result = await response.json();
  if (typeof result.city !== 'string' || typeof result.conditions !== 'string'
    || typeof result.temperature !== 'number') return null;
  return {
    display: `${result.city} · ${result.temperature}°F · ${result.conditions}`,
    spoken: `In ${result.city}, it's ${result.temperature} degrees Fahrenheit and ${result.conditions}.`,
  };
}

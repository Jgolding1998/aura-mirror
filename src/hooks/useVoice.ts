import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { parseWake } from '../lib/commands';
import type { AppConfig } from '../types';

export type VoiceState = 'off' | 'asleep' | 'awake' | 'error';

export const AWAKE_TIMEOUT_MS = 20000;

// The Web Speech API is missing from TypeScript's DOM library, so only what is used is typed.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FATAL_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it for this site in your browser settings, then press Start listening.',
  'service-not-allowed': "This browser's speech service is switched off, so voice cannot run here. Typed commands still work.",
  'audio-capture': 'No microphone was found. Connect one and press Start listening. Typed commands still work.',
  network: "The browser's speech service could not be reached. Typed commands still work.",
  'language-not-supported': 'This browser cannot recognise British English. Typed commands still work.',
};

/** More than this many sessions ending within the window means recognition is failing, not idling. */
const MAX_QUICK_RESTARTS = 6;
const RESTART_WINDOW_MS = 12000;

function pickBritishVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const british = window.speechSynthesis.getVoices().filter((voice) => voice.lang.replace('_', '-').toLowerCase().startsWith('en-gb'));
  const preferred = british.find((voice) => /natural|sonia|libby|google uk|serena|daniel|kate/i.test(voice.name));
  return preferred ?? british[0] ?? null;
}

interface Options {
  voiceConfig: AppConfig['voice'] | undefined;
  /** Receives text said while awake, or straight after the wake phrase. */
  onUtterance: (text: string) => void;
  /** Called when the wake phrase is heard on its own. */
  onWake: () => void;
}

export function useVoice({ voiceConfig, onUtterance, onWake }: Options) {
  const supported = typeof window !== 'undefined' && getRecognitionCtor() !== null;
  const [state, setState] = useState<VoiceState>('off');
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outputLabel, setOutputLabel] = useState('Checking voices');
  /** Bumps each time the idle countdown restarts; the HUD keys its depleting line on it. */
  const [awakeTick, setAwakeTick] = useState(0);

  const wantRef = useRef(false);
  const awakeRef = useRef(false);
  const speakingRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const idleRef = useRef<number | undefined>(undefined);
  const restartRef = useRef<number | undefined>(undefined);
  const endTimesRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speakIdRef = useRef(0);
  const fallbackReasonRef = useRef<string | null>(null);

  const handlersRef = useRef({ onUtterance, onWake });
  handlersRef.current = { onUtterance, onWake };
  const configRef = useRef(voiceConfig);
  configRef.current = voiceConfig;

  const browserLabel = useCallback(() => {
    if (!('speechSynthesis' in window)) return 'No speech output in this browser';
    const voice = pickBritishVoice();
    const prefix = fallbackReasonRef.current ? `${fallbackReasonRef.current}: browser ` : 'Browser ';
    return voice ? `${prefix}voice, ${voice.name} (en-GB)` : `${prefix}default voice, no en-GB voice installed`;
  }, []);

  const refreshLabel = useCallback(() => {
    const config = configRef.current;
    if (config?.provider === 'kokoro' && config.ready && !fallbackReasonRef.current) setOutputLabel('Kokoro · British English · on this computer');
    else if (config?.provider === 'elevenlabs' && config.ready && !fallbackReasonRef.current) setOutputLabel('ElevenLabs voice, via the local server');
    else setOutputLabel(browserLabel());
  }, [browserLabel]);

  useEffect(() => {
    refreshLabel();
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.addEventListener('voiceschanged', refreshLabel);
    return () => synth.removeEventListener('voiceschanged', refreshLabel);
  }, [refreshLabel, voiceConfig]);

  const clearIdle = () => {
    if (idleRef.current !== undefined) window.clearTimeout(idleRef.current);
    idleRef.current = undefined;
  };

  const sleep = useCallback(() => {
    clearIdle();
    awakeRef.current = false;
    setInterim('');
    if (wantRef.current) setState('asleep');
  }, []);

  const armIdle = useCallback(() => {
    clearIdle();
    if (!awakeRef.current) return;
    setAwakeTick((tick) => tick + 1);
    idleRef.current = window.setTimeout(sleep, AWAKE_TIMEOUT_MS);
  }, [sleep]);

  const wake = useCallback(() => {
    awakeRef.current = true;
    setState('awake');
    armIdle();
  }, [armIdle]);

  const handleFinal = useCallback(
    (transcript: string) => {
      const { woke, rest } = parseWake(transcript);
      if (woke) {
        wake();
        if (rest) handlersRef.current.onUtterance(rest);
        else handlersRef.current.onWake();
        return;
      }
      // Asleep: anything other than the wake phrase is dropped unread.
      if (!awakeRef.current) return;
      armIdle();
      handlersRef.current.onUtterance(transcript.trim());
    },
    [armIdle, wake],
  );

  const failFatally = useCallback((message: string) => {
    wantRef.current = false;
    clearIdle();
    awakeRef.current = false;
    if (restartRef.current !== undefined) window.clearTimeout(restartRef.current);
    setError(message);
    setInterim('');
    setState('error');
  }, []);

  const startRecognition = useCallback(() => {
    if (!wantRef.current || speakingRef.current || recRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.onresult = (event) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          setInterim('');
          handleFinal(result[0].transcript);
        } else {
          partial += result[0].transcript;
        }
      }
      // While asleep nothing is shown unless the wake phrase is already in it.
      if (partial && (awakeRef.current || parseWake(partial).woke)) setInterim(partial.trim());
      else if (!partial) setInterim('');
    };
    recognition.onerror = (event) => {
      const fatal = FATAL_ERRORS[event.error];
      if (fatal) failFatally(fatal);
      // no-speech and aborted are normal; onend restarts the session.
    };
    recognition.onend = () => {
      recRef.current = null;
      if (!wantRef.current || speakingRef.current) return;
      const now = performance.now();
      endTimesRef.current = [...endTimesRef.current.filter((t) => now - t < RESTART_WINDOW_MS), now];
      if (endTimesRef.current.length > MAX_QUICK_RESTARTS) {
        failFatally('Speech recognition keeps stopping in this browser, so listening has been switched off. Typed commands still work.');
        return;
      }
      restartRef.current = window.setTimeout(startRecognition, 300);
    };
    try {
      recognition.start();
      recRef.current = recognition;
    } catch {
      failFatally('Speech recognition could not start. Press Start listening to try again.');
    }
  }, [failFatally, handleFinal]);

  const stopRecognition = () => {
    if (restartRef.current !== undefined) window.clearTimeout(restartRef.current);
    const recognition = recRef.current;
    recRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
    }
  };

  const enable = useCallback(() => {
    if (!getRecognitionCtor()) {
      setError('This browser has no speech recognition. Chrome, Edge and Safari do. Typed commands still work.');
      setState('error');
      return;
    }
    setError(null);
    wantRef.current = true;
    awakeRef.current = false;
    endTimesRef.current = [];
    setState('asleep');
    startRecognition();
  }, [startRecognition]);

  const disable = useCallback(() => {
    wantRef.current = false;
    awakeRef.current = false;
    clearIdle();
    stopRecognition();
    setInterim('');
    setError(null);
    setState('off');
  }, []);

  const stopPlayback = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  const finishSpeaking = useCallback(
    (id: number) => {
      if (id !== speakIdRef.current) return;
      speakingRef.current = false;
      setSpeaking(false);
      stopPlayback();
      // A short gap keeps the tail of the reply out of the microphone.
      restartRef.current = window.setTimeout(startRecognition, 350);
      armIdle();
    },
    [armIdle, startRecognition],
  );

  const speakWithBrowser = useCallback(
    (text: string, id: number) => {
      if (!('speechSynthesis' in window)) {
        finishSpeaking(id);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-GB';
      const voice = pickBritishVoice();
      if (voice) utterance.voice = voice;
      // Some browsers never fire end, which would leave the microphone stopped.
      const guard = window.setTimeout(() => finishSpeaking(id), 4000 + text.length * 90);
      const done = () => {
        window.clearTimeout(guard);
        finishSpeaking(id);
      };
      utterance.onend = done;
      utterance.onerror = done;
      refreshLabel();
      window.speechSynthesis.speak(utterance);
    },
    [finishSpeaking, refreshLabel],
  );

  const speak = useCallback(
    async (text: string) => {
      const id = ++speakIdRef.current;
      stopPlayback();
      clearIdle();
      // Recognition stays off during playback, so the mirror cannot hear itself.
      stopRecognition();
      speakingRef.current = true;
      setSpeaking(true);

      const config = configRef.current;
      if (config?.provider !== 'browser' && config?.ready && !fallbackReasonRef.current) {
        try {
          const blob = await api.voice(text);
          if (id !== speakIdRef.current) return;
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => finishSpeaking(id);
          audio.onerror = () => finishSpeaking(id);
          await audio.play();
          return;
        } catch {
          if (id !== speakIdRef.current) return;
          // Reported truthfully in the HUD; not retried until the page reloads.
          fallbackReasonRef.current = config.provider === 'kokoro' ? 'Local voice unavailable' : 'ElevenLabs unavailable';
        }
      }
      speakWithBrowser(text, id);
    },
    [finishSpeaking, speakWithBrowser],
  );

  useEffect(
    () => () => {
      wantRef.current = false;
      speakIdRef.current += 1;
      clearIdle();
      stopRecognition();
      stopPlayback();
    },
    [],
  );

  return { state, speaking, interim, error, outputLabel, awakeTick, supported, enable, disable, speak };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, Hand, PanelRight, Settings as SettingsIcon, X } from 'lucide-react';
import { ClosetPanel } from './components/ClosetPanel';
import { AssistantHud } from './components/AssistantHud';
import { CommandDock } from './components/CommandDock';
import type { DockMessage } from './components/CommandDock';
import { ConfirmDelete } from './components/ConfirmDelete';
import { GarmentStage } from './components/GarmentStage';
import { ItemDialog } from './components/ItemDialog';
import { LiveFit } from './components/LiveFit';
import type { ItemDialogRequest } from './components/ItemDialog';
import { Onboarding } from './components/Onboarding';
import { OverlayControls } from './components/OverlayControls';
import { RoomScene } from './components/RoomScene';
import { SettingsPanel } from './components/SettingsPanel';
import { TryOnPanel } from './components/TryOnPanel';
import type { PhotoCapture } from './components/TryOnPanel';
import { useCamera } from './hooks/useCamera';
import { useCloset } from './hooks/useCloset';
import { useHandPointer } from './hooks/useHandPointer';
import type { HandStatus } from './hooks/useHandPointer';
import { usePoseAnchor } from './hooks/usePoseAnchor';
import { useVoice } from './hooks/useVoice';
import { api, errorMessage } from './lib/api';
import { captureFrame, captureGarmentFrame, composeMirrorPhoto } from './lib/capture';
import { parseCommand, parseWake } from './lib/commands';
import { armWelcomeAudio, playWelcomeMusic, readWelcomeWeather } from './lib/welcome';
import type { Command } from './lib/commands';
import { loadJson, loadString, saveJson, saveString } from './lib/storage';
import { CATEGORIES, CATEGORY_LABEL, DEFAULT_OVERLAY } from './types';
import type { AppConfig, Category, ClosetItem, OverlaySettings } from './types';

const HAND_LABEL: Record<HandStatus, string> = {
  off: 'Hand off',
  loading: 'Hand loading',
  searching: 'No hand in view',
  tracking: 'Hand tracking',
  error: 'Hand unavailable',
};

type Origin = 'typed' | 'voice' | 'ui';

interface Notice {
  id: string;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  action2Label?: string;
  onAction2?: () => void;
}

const countPhrase = (items: ClosetItem[]) =>
  CATEGORIES.map((category) => {
    const count = items.filter((item) => item.category === category).length;
    const word = CATEGORY_LABEL[category].toLowerCase();
    return `${count} ${count === 1 && category !== 'pants' ? word.slice(0, -1) : word}`;
  }).join(', ');

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const closet = useCloset();
  const { items } = closet;

  const [onboarded, setOnboarded] = useState(() => loadString('aura.onboarded') === 'yes');
  const [closetOpen, setClosetOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [weather, setWeather] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('shirts');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadString('aura.selected'));
  const [previewItem, setPreviewItem] = useState<ClosetItem | null>(null);
  const [overlay, setOverlay] = useState<OverlaySettings>(() => loadJson('aura.overlay', DEFAULT_OVERLAY));
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [handOn, setHandOn] = useState(false);
  const [anchorsOn, setAnchorsOn] = useState(false);
  const [speakTyped, setSpeakTyped] = useState(() => loadString('aura.speakTyped') === 'yes');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemDialog, setItemDialog] = useState<ItemDialogRequest | null>(null);
  const [deleting, setDeleting] = useState<ClosetItem | null>(null);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [liveItem, setLiveItem] = useState<ClosetItem | null>(null);
  const [tryOnItem, setTryOnItem] = useState<ClosetItem | null>(null);
  const [photo, setPhoto] = useState<PhotoCapture | null>(null);

  const [message, setMessage] = useState<DockMessage>({ id: 0, text: 'Pick a shirt and press Try on, or use your own shirt photo.' });
  const [thinking, setThinking] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [transientNotice, setTransientNotice] = useState<Notice | null>(null);

  const messageId = useRef(1);
  const assistantRun = useRef<AbortController | null>(null);
  const welcomeRun = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const overlayImageRef = useRef<HTMLImageElement>(null);
  const restoredSelection = useRef(false);

  const camera = useCamera(config?.camera);
  const mirrored = true;

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api.config());
      setConfigError(null);
    } catch (e) {
      setConfigError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => saveJson('aura.overlay', overlay), [overlay]);
  useEffect(() => saveString('aura.selected', selectedId), [selectedId]);
  useEffect(() => saveString('aura.speakTyped', speakTyped ? 'yes' : null), [speakTyped]);

  const inCategory = useMemo(() => items.filter((item) => item.category === category), [items, category]);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const focused = inCategory.find((item) => item.id === focusId);
  const shown = previewItem ?? focused ?? inCategory[0] ?? null;

  // First load: start on the remembered selection. Also repairs focus when an item is deleted.
  useEffect(() => {
    if (!items.length) return;
    if (!restoredSelection.current) {
      restoredSelection.current = true;
      if (selected) {
        setFocusId(selected.id);
        setCategory(selected.category);
        return;
      }
    }
    if (!focused) setFocusId(inCategory[0]?.id ?? null);
  }, [items.length, focused, inCategory, selected]);

  const hand = useHandPointer({
    enabled: handOn && camera.live,
    getMedia: camera.getMedia,
    mirrored,
    modelUrl: config?.gestures.modelUrl,
    wasmPath: config?.gestures.wasmPath,
  });

  const pose = usePoseAnchor({
    enabled: anchorsOn && camera.live && !liveItem,
    getMedia: camera.getMedia,
    mirrored,
    category: shown?.category ?? null,
    poseModelUrl: config?.gestures.poseModelUrl,
    wasmPath: config?.gestures.wasmPath,
    targetRef: anchorRef,
  });

  const runTextRef = useRef<(text: string, origin: Origin) => void>(() => undefined);
  const voice = useVoice({
    voiceConfig: config?.voice,
    onUtterance: (text) => runTextRef.current(text, 'voice'),
    onWake: () => replyRef.current('Yes?', 'voice'),
  });

  const reply = (text: string, origin: Origin, heard?: string, source?: string) => {
    setMessage({ id: messageId.current++, text, heard, source });
    if (origin === 'voice' || (origin === 'typed' && speakTyped)) void voice.speak(text);
  };
  const replyRef = useRef(reply);
  replyRef.current = reply;

  // ---------------------------------------------------------------- closet actions

  const chooseCategory = (next: Category) => {
    setPreviewItem(null);
    setCategory(next);
    const list = items.filter((item) => item.category === next);
    setFocusId((selected?.category === next ? selected : list[0])?.id ?? null);
    return list;
  };

  const moveFocus = (delta: number): ClosetItem | null => {
    setPreviewItem(null);
    if (!inCategory.length) return null;
    const index = inCategory.findIndex((item) => item.id === focusId);
    const next = inCategory[(index + delta + inCategory.length) % inCategory.length];
    setFocusId(next.id);
    return next;
  };

  const selectItem = (item: ClosetItem) => {
    if (item.source === 'preview') return;
    setPreviewItem(null);
    setSelectedId(item.id);
    setFocusId(item.id);
    setCategory(item.category);
    if (!overlay.visible) setOverlay({ ...overlay, visible: true });
  };

  const closeCloset = () => {
    setClosetOpen(false);
    if (selected) {
      setFocusId(selected.id);
      setCategory(selected.category);
    }
  };

  const openAddDialog = (fromCamera: boolean, origin: Origin = 'ui', intent?: 'preview') => {
    if (closet.readOnly) {
      reply("I can't save anything until the local server is back.", origin);
      return;
    }
    let image: string | undefined;
    if (fromCamera && camera.live) {
      try {
        image = captureGarmentFrame(camera.getMedia());
      } catch (e) {
        reply(errorMessage(e), origin);
      }
    }
    setItemDialog({ mode: 'add', image, defaultCategory: category, intent });
  };

  const capturePhoto = (): PhotoCapture => {
    const media = camera.getMedia();
    const person = captureFrame(media);
    const image = overlay.visible && pose.status === 'tracking' ? overlayImageRef.current : null;
    const composite = composeMirrorPhoto(
      media,
      mirrored,
      image ? { image, rect: image.getBoundingClientRect(), opacity: overlay.opacity } : null,
    );
    return { person, composite };
  };

  const takePhoto = (origin: Origin) => {
    if (!camera.live) {
      reply('The camera is off, so there is nothing to photograph. Press Start camera first.', origin);
      return;
    }
    try {
      setPhoto(capturePhoto());
      setTryOnItem(shown);
      setTryOnOpen(true);
      reply('Photo taken.', origin);
    } catch (e) {
      reply(errorMessage(e), origin);
    }
  };

  const openPhotoTryOn = (item: ClosetItem | null) => {
    if (!item) {
      openAddDialog(true, 'ui', 'preview');
      return;
    }
    setPhoto(null);
    setTryOnItem(item);
    setTryOnOpen(true);
  };

  const openTryOn = (item: ClosetItem | null) => {
    if (!item || item.category === 'pants') {
      setLiveItem(null);
      openPhotoTryOn(item);
      return;
    }
    setLiveItem(item);
    setTryOnOpen(false);
    if (!camera.live && camera.status !== 'starting') void camera.start();
    setMessage({
      id: messageId.current++,
      text: item.source === 'preview' ? 'Set the shirt down and face the camera.' : `Live try-on for ${item.name}.`,
    });
  };

  const toggleHand = () => {
    if (!handOn && !camera.live) {
      setTransientNotice({
        id: 'hand-camera',
        title: 'Hand pointer needs the camera',
        detail: 'Start the camera first, then switch this on.',
        actionLabel: 'Start camera',
        onAction: () => {
          setHandOn(true);
          void camera.start();
        },
      });
      return;
    }
    setHandOn(!handOn);
  };

  const toggleVoice = () => {
    if (voice.state === 'asleep' || voice.state === 'awake') voice.disable();
    else {
      armWelcomeAudio();
      voice.enable();
    }
    setDismissed((list) => list.filter((id) => id !== 'voice'));
  };

  const welcomeHome = async (heard: string) => {
    welcomeRun.current?.abort();
    const run = new AbortController();
    welcomeRun.current = run;
    playWelcomeMusic(config?.welcomeMusic === true);
    const hour = new Date().getHours();
    const greeting = `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, sir. Welcome home.`;
    setMessage({ id: messageId.current++, text: greeting, heard });
    const forecast = await readWelcomeWeather(run.signal).catch(() => null);
    if (run.signal.aborted) return;
    setWeather(forecast?.display ?? null);
    const text = `${greeting} ${forecast?.spoken ?? 'The weather update is unavailable right now.'}`;
    setMessage({ id: messageId.current++, text, heard });
    void voice.speak(text);
  };

  // ---------------------------------------------------------------- commands

  const execute = (command: Command, origin: Origin, heard: string) => {
    const say = (text: string, source?: string) => reply(text, origin, heard, source);
    switch (command.type) {
      case 'welcome-home':
        if (origin !== 'voice') armWelcomeAudio();
        void welcomeHome(heard);
        break;
      case 'try-clothes':
        setClosetOpen(true);
        chooseCategory('shirts');
        if (!camera.live && camera.status !== 'starting') void camera.start();
        say('Let’s try on some clothes. Pick a shirt or say its name.');
        break;
      case 'open-closet':
        setClosetOpen(true);
        say(items.length ? `Here's your closet: ${countPhrase(items)}.` : 'Your closet is empty at the moment. Shall we add something?');
        break;
      case 'close-closet':
        closeCloset();
        say('Closet closed.');
        break;
      case 'category': {
        setClosetOpen(true);
        const list = chooseCategory(command.category);
        const label = CATEGORY_LABEL[command.category].toLowerCase();
        say(list.length ? `Your ${label}. The ${list[0].name} is first.` : `You haven't any ${label} yet.`);
        break;
      }
      case 'next':
      case 'previous': {
        const next = moveFocus(command.type === 'next' ? 1 : -1);
        say(next ? `The ${next.name}.` : 'Nothing in this category yet.');
        break;
      }
      case 'select':
        if (shown) {
          selectItem(shown);
          if (/\b(try|wear|put)\b/i.test(heard)) {
            openTryOn(shown);
            say(`Ready to try on the ${shown.name}.`);
          } else say(`Selected the ${shown.name}.`);
        } else openTryOn(null);
        break;
      case 'try-held':
        openAddDialog(true, origin, 'preview');
        say(camera.live ? 'Check the garment photo, then try it without saving.' : 'Start the camera or choose a garment photo.');
        break;
      case 'item': {
        const item = items.find((candidate) => candidate.id === command.id);
        if (!item) break;
        setClosetOpen(true);
        if (command.action === 'select') {
          selectItem(item);
          if (/\b(try|wear|put)\b/i.test(heard)) openTryOn(item);
          say(`Selected the ${item.name}.`);
        } else {
          setCategory(item.category);
          setFocusId(item.id);
          say(`The ${item.name}.`);
        }
        break;
      }
      case 'look':
        if (shown) selectItem(shown);
        void askAssistant(heard, origin, shown, true);
        break;
      case 'add-to-closet':
        openAddDialog(true, origin);
        say(camera.live ? 'Captured. Check the details, then save it.' : 'The camera is off, so choose a photo to add.');
        break;
      case 'take-photo':
        takePhoto(origin);
        break;
      case 'generate-tryon':
        openPhotoTryOn(shown);
        say('Take or choose a photo of yourself to try on the garment.');
        break;
      case 'stop-listening':
        voice.disable();
        say('Right you are. I have stopped listening.');
        break;
      case 'start-listening':
        armWelcomeAudio();
        voice.enable();
        say('Listening now. Say "Hey Meta" when you need me.');
        break;
      case 'start-camera':
        void camera.start();
        say('Starting the camera.');
        break;
      case 'stop-camera':
        camera.stop();
        say('Camera off.');
        break;
      case 'hand-on':
        if (camera.live) {
          setHandOn(true);
          say('Hand pointer on. Point with your index finger and pinch to click.');
        } else say('The hand pointer needs the camera. Start that first.');
        break;
      case 'hand-off':
        setHandOn(false);
        say('Hand pointer off.');
        break;
      case 'show-overlay':
        setOverlay({ ...overlay, visible: true });
        say('Overlay on.');
        break;
      case 'hide-overlay':
        setLiveItem(null);
        setOverlay({ ...overlay, visible: false });
        say('Overlay hidden.');
        break;
      case 'help':
        setSettingsOpen(true);
        say('Here is everything you can say and press.');
        break;
    }
  };

  const askAssistant = async (text: string, origin: Origin, item: ClosetItem | null, wantsLook = false) => {
    assistantRun.current?.abort();
    const controller = new AbortController();
    assistantRun.current = controller;
    setThinking(true);
    setMessage({ id: messageId.current++, heard: text, text: '' });
    // A frame is only sent when the person asks about their look and Meta vision is set up.
    let imageDataUrl: string | undefined;
    if (wantsLook && camera.live && config?.vision.provider === 'meta' && config.vision.ready) {
      try {
        const look = capturePhoto();
        imageDataUrl = look.composite ?? look.person;
      } catch {
        imageDataUrl = undefined;
      }
    }
    try {
      const result = await api.assistant({ message: text, selectedItemId: item?.source === 'preview' ? undefined : item?.id, imageDataUrl }, controller.signal);
      if (controller.signal.aborted) return;
      setThinking(false);
      reply(result.text, origin, text, result.provider === 'meta' ? 'Meta' : 'Local reply');
    } catch (e) {
      if (controller.signal.aborted) return;
      setThinking(false);
      const fallback = wantsLook && item ? `Press Try on to see the ${item.name} on you. ` : '';
      reply(`${fallback}I couldn't get an answer: ${errorMessage(e)}`, origin, text);
    }
  };

  const runText = (raw: string, origin: Origin) => {
    const { woke, rest } = parseWake(raw);
    const text = woke ? rest : raw.trim();
    if (!text) {
      reply('Yes?', origin, raw);
      return;
    }
    const command = parseCommand(text, items);
    if (command?.type !== 'welcome-home') welcomeRun.current?.abort();
    if (command) execute(command, origin, text);
    else void askAssistant(text, origin, shown);
  };
  runTextRef.current = runText;

  // ---------------------------------------------------------------- keyboard

  const keyboard = useRef({ moveFocus, chooseCategory, category, shown, selectItem, closetOpen, closeCloset });
  keyboard.current = { moveFocus, chooseCategory, category, shown, selectItem, closetOpen, closeCloset };

  const stageActive = onboarded;
  useEffect(() => {
    if (!stageActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input:not([type="range"]):not([type="checkbox"]), textarea, select');
      if (typing || target?.matches('input[type="range"]')) return;
      const k = keyboard.current;
      switch (event.key) {
        case '/':
          event.preventDefault();
          inputRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          k.moveFocus(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          k.moveFocus(-1);
          break;
        case 'ArrowRight':
        case 'ArrowLeft': {
          event.preventDefault();
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const index = CATEGORIES.indexOf(k.category);
          k.chooseCategory(CATEGORIES[(index + delta + CATEGORIES.length) % CATEGORIES.length]);
          break;
        }
        case 'Enter':
          // A focused button should do its own job.
          if (target?.closest('button, a') || !k.shown) return;
          event.preventDefault();
          k.selectItem(k.shown);
          break;
        case 'Escape':
          if (k.closetOpen) k.closeCloset();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stageActive]);

  // ---------------------------------------------------------------- derived display

  const enterStage = () => {
    saveString('aura.onboarded', 'yes');
    setOnboarded(true);
  };

  const notices: Notice[] = [];
  if (camera.error) {
    notices.push({
      id: `camera-${camera.error.code}`,
      title: camera.error.title,
      detail: camera.error.detail,
      actionLabel: 'Try again',
      onAction: () => void camera.start(),
      action2Label: 'Use sample view',
      onAction2: camera.stop,
    });
  }
  if (camera.captureBlocked && camera.live) {
    notices.push({
      id: 'capture-blocked',
      title: 'This stream can be seen but not captured',
      detail: 'The Pi stream sends no CORS header, so photos, adding to the closet and hand tracking cannot read it. Add an Access-Control-Allow-Origin header to the stream.',
    });
  }
  if (closet.status === 'offline') {
    notices.push({
      id: 'closet-offline',
      title: 'The local server is not answering',
      detail: `Showing the bundled sample closet, read-only. ${closet.error ?? ''}`,
      actionLabel: 'Try again',
      onAction: () => {
        void closet.reload();
        void loadConfig();
      },
    });
  }
  if (hand.status === 'error' && hand.error) {
    notices.push({
      id: 'hand',
      title: 'Hand pointer is unavailable',
      detail: `${hand.error} Click, keyboard and typed commands all still work.`,
      actionLabel: 'Switch it off',
      onAction: () => setHandOn(false),
    });
  }
  if (voice.state === 'error' && voice.error) {
    notices.push({ id: 'voice', title: 'Voice is unavailable', detail: voice.error });
  }
  if (transientNotice) notices.push(transientNotice);
  const visibleNotices = notices.filter((notice) => !dismissed.includes(notice.id));

  const dismissNotice = (id: string) => {
    if (id === transientNotice?.id) setTransientNotice(null);
    else setDismissed((list) => [...list, id]);
  };

  const sessionLabel = camera.live
    ? overlay.visible
      ? 'Live overlay'
      : 'Live mirror'
    : camera.status === 'starting'
      ? 'Starting camera'
      : 'Sample view, camera off';

  const settingsRows = [
    {
      name: 'Camera',
      state: camera.live ? 'Live' : camera.status === 'starting' ? 'Starting' : camera.status === 'error' ? 'Error' : 'Off',
      tone: camera.live ? ('good' as const) : camera.status === 'error' ? ('warn' as const) : undefined,
      detail:
        (camera.activeSource ?? config?.camera.source) === 'stream'
          ? `Pi stream at ${config?.camera.streamUrl ?? 'no address set'}${camera.captureBlocked ? ', view only (no CORS)' : ''}`
          : 'This browser, via getUserMedia',
    },
    {
      name: 'Hand pointer',
      state: HAND_LABEL[hand.status],
      tone: hand.status === 'tracking' ? ('good' as const) : hand.status === 'error' ? ('warn' as const) : undefined,
      detail: hand.error ?? 'MediaPipe HandLandmarker, running in this browser',
    },
    {
      name: 'Body anchors',
      state: pose.status === 'off' ? 'Off, manual alignment' : pose.status === 'tracking' ? 'Tracking' : pose.status === 'error' ? 'Unavailable' : pose.status === 'loading' ? 'Loading' : 'No body in view',
      tone: pose.status === 'tracking' ? ('good' as const) : pose.status === 'error' ? ('warn' as const) : undefined,
      detail: pose.error ?? (config?.gestures.poseModelUrl ? 'MediaPipe PoseLandmarker, local model' : "MediaPipe PoseLandmarker. Its model downloads from Google's storage when switched on"),
    },
    {
      name: 'Voice input',
      state: !voice.supported ? 'Not supported here' : voice.state === 'off' ? 'Off' : voice.state === 'asleep' ? 'Asleep' : voice.state === 'awake' ? 'Awake' : 'Error',
      tone: voice.state === 'awake' ? ('good' as const) : voice.state === 'error' || !voice.supported ? ('warn' as const) : undefined,
      detail: config?.speech.provider === 'whisper' && config.speech.ready
        ? 'Browser speech recognition, which may use a cloud service. A Whisper server is set up, but this build does not record to it'
        : 'Browser speech recognition, which may use a cloud service',
    },
    {
      name: 'Voice replies',
      state: config?.voice.provider === 'kokoro' && config.voice.ready ? 'Kokoro (local)' : config?.voice.provider === 'elevenlabs' && config.voice.ready ? 'ElevenLabs' : 'Browser',
      detail: voice.outputLabel,
    },
    {
      name: 'Assistant',
      state: config?.vision.provider === 'meta' && config.vision.ready ? 'Meta' : 'Local',
      tone: undefined,
      detail: config?.vision.provider === 'meta' && config.vision.ready ? 'Meta vision, through the local server' : 'Built-in replies from the local server, no AI model',
    },
    {
      name: 'Generated try-on',
      state: config?.tryon.provider === 'fashn-local' && config.tryon.ready ? 'Ready' : 'Not set up',
      tone: config?.tryon.provider === 'fashn-local' && config.tryon.ready ? ('good' as const) : undefined,
      detail: config?.tryon.provider === 'fashn-local' && config.tryon.ready
        ? (config.tryon.cpu ? 'FASHN on this PC’s CPU' : 'FASHN on your try-on server')
        : 'Live overlay is available. Connect a FASHN service to generate photos.',
    },
    {
      name: 'Closet storage',
      state: closet.status === 'ready' ? 'Saved locally' : closet.status === 'loading' ? 'Loading' : 'Offline',
      tone: closet.status === 'ready' ? ('good' as const) : closet.status === 'offline' ? ('warn' as const) : undefined,
      detail: closet.status === 'offline' ? 'Read-only sample, because the server is unreachable' : 'On this computer, through the local server',
    },
  ];

  const handleSelect = (item: ClosetItem) => {
    selectItem(item);
    setMessage({ id: messageId.current++, text: `Selected the ${item.name}. Press Try on to see it on you.` });
  };

  if (!onboarded) {
    return (
      <Onboarding
        onStartCamera={() => {
          enterStage();
          armWelcomeAudio();
          void camera.start();
          voice.enable();
        }}
        onExplore={() => { enterStage(); setClosetOpen(true); }}
      />
    );
  }

  const voiceLabel = voice.state === 'awake' ? 'Voice awake' : voice.state === 'asleep' ? 'Voice asleep' : voice.state === 'error' ? 'Voice unavailable' : 'Voice off';

  return (
    <div className="stage" data-camera={camera.status} data-mirror-idle={camera.live && !closetOpen && !liveItem} data-testid="app-stage">
      {/* Camera layer. Flipped with CSS, so what you see behaves like a mirror. */}
      <video
        ref={camera.attachVideo}
        className="stage__media"
        data-visible={camera.live && camera.activeSource === 'browser'}
        data-mirrored={mirrored}
        data-testid="camera-video"
        aria-label="Your camera view"
        playsInline
        muted
        autoPlay
      />
      {camera.streamSrc && (
        <img
          key={camera.streamSrc.key}
          ref={camera.attachImage}
          className="stage__media"
          data-visible={camera.live}
          data-mirrored={mirrored}
          src={camera.streamSrc.url}
          crossOrigin={camera.streamSrc.crossOrigin ? 'anonymous' : undefined}
          onError={camera.onStreamError}
          alt="Your camera view from the Pi stream"
        />
      )}
      {!camera.live && <RoomScene />}
      {liveItem && camera.live && !tryOnOpen && !itemDialog && config?.gestures.wasmPath && (
        <LiveFit imageUrl={liveItem.imageUrl} crewNeck={liveItem.category === 'shirts'} getMedia={camera.getMedia}
          poseModelUrl={config.gestures.poseModelUrl} wasmPath={config.gestures.wasmPath} />
      )}
      <div className="stage__scrim" aria-hidden="true" />

      <div className="frame" aria-hidden="true">
        <span className="frame__corner frame__corner--tl" />
        <span className="frame__corner frame__corner--tr" />
        <span className="frame__corner frame__corner--bl" />
        <span className="frame__corner frame__corner--br" />
        <span className="frame__tape" />
      </div>

      <GarmentStage item={!closetOpen || liveItem || (camera.live && (!anchorsOn || shown?.source === 'sample')) ? null : shown} live={camera.live} settings={overlay} anchorRef={anchorRef} imageRef={overlayImageRef} />

      <div className="ui" data-closet={closetOpen} data-adjust={adjustOpen}>
        <header className="top">
          <div className="top__brand">
            <span className="brand">
              <span className="brand__mark" aria-hidden="true" />
              Aura
            </span>
            <span className="top__session" data-testid="session-status">
              {sessionLabel}
            </span>
          </div>
          <div className="top__status" role="group" aria-label="Hardware">
            {camera.live ? (
              <button type="button" className="pill" data-on="true" aria-label="Stop camera" onClick={() => { setLiveItem(null); camera.stop(); }} data-testid="camera-toggle">
                <Camera aria-hidden="true" />
                <span>Camera live</span>
              </button>
            ) : (
              <button type="button" className="pill" data-tone={camera.status === 'error' ? 'warn' : undefined} aria-label="Start camera" disabled={camera.status === 'starting'} onClick={() => void camera.start()} data-testid="camera-toggle">
                <CameraOff aria-hidden="true" />
                <span>{camera.status === 'starting' ? 'Starting' : camera.status === 'error' ? 'Camera error' : 'Camera off'}</span>
              </button>
            )}
            <button type="button" className="pill" data-on={hand.status === 'tracking' || hand.status === 'searching'} data-tone={hand.status === 'error' ? 'warn' : undefined} aria-pressed={handOn} aria-label={handOn ? 'Turn off hand pointer' : 'Turn on hand pointer'} onClick={toggleHand} data-testid="hand-toggle">
              <Hand aria-hidden="true" />
              <span>{handOn && !camera.live ? 'Hand waiting' : HAND_LABEL[hand.status]}</span>
            </button>
            <span className="pill pill--static" data-on={voice.state === 'awake' || voice.state === 'asleep'} data-tone={voice.state === 'error' ? 'warn' : undefined} data-testid="voice-status">
              <span className="pill__dot" aria-hidden="true" />
              <span>{voiceLabel}</span>
            </span>
            <button type="button" className="pill" aria-expanded={closetOpen} aria-label={closetOpen ? 'Hide closet' : 'Show closet'} onClick={() => (closetOpen ? closeCloset() : setClosetOpen(true))} data-testid="closet-toggle">
              <PanelRight aria-hidden="true" />
              <span>Closet</span>
            </button>
            <button type="button" className="icon-button icon-button--pill" aria-label="Settings and help" onClick={() => setSettingsOpen(true)} data-testid="settings-open">
              <SettingsIcon aria-hidden="true" />
            </button>
          </div>
          <AssistantHud
          listening={voice.state === 'asleep' || voice.state === 'awake'}
          speaking={voice.speaking}
          awake={voice.state === 'awake'}
          cameraLive={camera.live}
          weather={weather}
          onToggleListening={toggleVoice}
          onToggleCamera={() => { if (camera.live) { setLiveItem(null); camera.stop(); } else void camera.start(); }}
          closetOpen={closetOpen}
          onOpenCloset={() => { if (closetOpen) closeCloset(); else setClosetOpen(true); }}
          />
        </header>

        {visibleNotices.length > 0 && (
          <div className="notices">
            {visibleNotices.map((notice) => (
              <div key={notice.id} className="notice" role="alert" data-testid={`notice-${notice.id}`}>
                <div className="notice__text">
                  <strong>{notice.title}</strong>
                  <p>{notice.detail}</p>
                </div>
                <div className="notice__actions">
                  {notice.actionLabel && (
                    <button type="button" className="text-button" onClick={notice.onAction}>
                      {notice.actionLabel}
                    </button>
                  )}
                  {notice.action2Label && (
                    <button type="button" className="text-button" onClick={notice.onAction2}>
                      {notice.action2Label}
                    </button>
                  )}
                  <button type="button" className="icon-button" aria-label={`Dismiss: ${notice.title}`} onClick={() => dismissNotice(notice.id)}>
                    <X aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="left">
          {adjustOpen && (
            <OverlayControls
              live={camera.live}
              settings={overlay}
              onChange={setOverlay}
              anchorsOn={anchorsOn}
              poseStatus={pose.status}
              poseError={pose.error}
              onToggleAnchors={() => setAnchorsOn(!anchorsOn)}
            />
          )}
          {shown && (closetOpen || liveItem) && (
            <div className="caption" key={shown.id} data-testid="selected-caption">
              <p className="caption__kicker">
                {CATEGORY_LABEL[shown.category]}
                {shown.source === 'sample' ? ', sample photo' : ''}
                {shown.source === 'preview' ? ', preview only' : ''}
                {shown.id === selectedId ? ', selected' : ''}
              </p>
              <p className="caption__name">{shown.name}</p>
            </div>
          )}
        </div>

        {closetOpen && (
          <ClosetPanel
            items={items}
            category={category}
            focusId={shown?.id ?? null}
            selectedId={selectedId}
            loading={closet.status === 'loading'}
            readOnly={closet.readOnly}
            onCategory={(next) => void chooseCategory(next)}
            onSelect={handleSelect}
            onTryOn={openTryOn}
            onTryOwn={() => openAddDialog(false, 'ui', 'preview')}
            onAdd={() => openAddDialog(true)}
            onEdit={(item) => setItemDialog({ mode: 'edit', item, defaultCategory: item.category })}
            onDelete={setDeleting}
          />
        )}

        {(closetOpen || commandOpen || liveItem) ? <CommandDock
          message={message}
          thinking={thinking}
          voiceState={voice.state}
          speaking={voice.speaking}
          interim={voice.interim}
          awakeTick={voice.awakeTick}
          outputLabel={voice.outputLabel}
          inputRef={inputRef}
          hideTryOn={tryOnOpen}
          liveTryOn={!!liveItem}
          onSubmit={(text) => runText(text, 'typed')}
          onToggleVoice={toggleVoice}
          onPhoto={() => takePhoto('ui')}
          onAdd={() => openAddDialog(true)}
          onTryOn={() => openTryOn(shown)}
          onStopTryOn={() => setLiveItem(null)}
          onRenderPhoto={() => openPhotoTryOn(liveItem)}
          onAdjust={() => setAdjustOpen(!adjustOpen)}
          adjustOpen={adjustOpen}
        /> : (
          <button className="button mirror-command" onClick={() => setCommandOpen(true)}>Type a command</button>
        )}
      </div>

      <div ref={hand.cursorRef} className="hand-cursor" data-visible="false" data-pinching="false" data-testid="hand-cursor" aria-hidden="true">
        <span />
      </div>

      {itemDialog && (
        <ItemDialog
          request={itemDialog}
          vision={config?.vision}
          cameraLive={camera.live}
          onStartCamera={() => void camera.start()}
          onCaptureFromCamera={() => captureGarmentFrame(camera.getMedia())}
          onPreview={async (item) => {
            const imageUrl = await api.previewGarment(item.imageDataUrl, item.removeBackground === true);
            const garment: ClosetItem = { id: 'held-preview', name: item.name, category: item.category, color: item.color ?? '', imageUrl, createdAt: new Date().toISOString(), source: 'preview' };
            setPreviewItem(garment);
            openTryOn(garment);
          }}
          onAdd={async (item) => {
            const created = await closet.add(item);
            setPreviewItem(null);
            setCategory(created.category);
            setFocusId(created.id);
            setClosetOpen(true);
            setMessage({ id: messageId.current++, text: `The ${created.name} is in your closet.` });
          }}
          onEdit={async (id, patch) => {
            const updated = await closet.update(id, patch);
            if (id === focusId) setCategory(updated.category);
          }}
          onClose={() => setItemDialog(null)}
        />
      )}

      {deleting && (
        <ConfirmDelete
          item={deleting}
          onConfirm={async () => {
            const { id, name } = deleting;
            await closet.remove(id);
            if (selectedId === id) setSelectedId(null);
            if (focusId === id) setFocusId(items.find((item) => item.id !== id && item.category === category)?.id ?? null);
            setMessage({ id: messageId.current++, text: `The ${name} is gone from your closet.` });
          }}
          onClose={() => setDeleting(null)}
        />
      )}

      {tryOnOpen && (
        <TryOnPanel
          photo={photo}
          item={tryOnItem}
          tryon={config?.tryon}
          cameraLive={camera.live}
          getMedia={camera.getMedia}
          cameraError={camera.error?.detail}
          onStartCamera={() => void camera.start()}
          onCapture={() => ({ person: captureFrame(camera.getMedia(), 1600, tryOnItem?.category !== 'pants') })}
          onPhoto={setPhoto}
          onClose={() => setTryOnOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          config={config}
          configError={configError}
          rows={settingsRows}
          speakTyped={speakTyped}
          onSpeakTyped={setSpeakTyped}
          onTestVoice={() => void voice.speak('Good evening. Your wardrobe is ready. Shall we find something to wear?')}
          onUseBrowserCamera={config?.camera.source === 'stream' ? () => void camera.start(true) : null}
          onReplayIntro={() => {
            setSettingsOpen(false);
            camera.stop();
            voice.disable();
            setHandOn(false);
            saveString('aura.onboarded', null);
            setOnboarded(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

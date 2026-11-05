/**
 * Pure wake-phrase and command parsing, shared by voice and typed input.
 * No imports, so it can be unit-tested directly.
 */

export type CategoryName = 'shirts' | 'pants' | 'jackets';

export type Command =
  | { type: 'open-closet' }
  | { type: 'welcome-home' }
  | { type: 'try-clothes' }
  | { type: 'close-closet' }
  | { type: 'category'; category: CategoryName }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'select' }
  | { type: 'look' }
  | { type: 'add-to-closet' }
  | { type: 'try-held' }
  | { type: 'take-photo' }
  | { type: 'generate-tryon' }
  | { type: 'stop-listening' }
  | { type: 'start-listening' }
  | { type: 'start-camera' }
  | { type: 'stop-camera' }
  | { type: 'hand-on' }
  | { type: 'hand-off' }
  | { type: 'show-overlay' }
  | { type: 'hide-overlay' }
  | { type: 'help' }
  | { type: 'item'; id: string; action: 'show' | 'select' };

export interface NamedItem {
  id: string;
  name: string;
  color: string;
  category: CategoryName;
}

const WAKE = /(?:^|[^a-z])(?:hey|hay|hi|hiya|wake\s+up)[\s,]+(?:meta|metta|mehta|meter)(?![a-z])[\s,.!?:;-]*(.*)$/i;

/** Finds the wake phrase. `rest` is whatever followed it, in the original wording. */
export function parseWake(transcript: string): { woke: boolean; rest: string } {
  const text = transcript.trim();
  const match = WAKE.exec(text);
  if (match) return { woke: true, rest: match[1].trim() };
  return { woke: false, rest: text };
}

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORY_WORDS: Record<CategoryName, RegExp> = {
  shirts: /\b(shirts?|tops?)\b/,
  pants: /\b(pants|trousers|chinos|jeans|bottoms)\b/,
  jackets: /\b(jackets?|coats?|outerwear|bombers?)\b/,
};

const SEE_VERB = /\b(show|see|view|open|browse|switch|go to|look at|display|what's in|what is in|what are)\b/;
const WEAR_VERB = /\b(show|see|view|try|wear|select|choose|pick|put)\b/;
const SELECT_VERB = /\b(try|wear|select|choose|pick|put)\b/;
const DEICTIC = '(this|that|it|this one|that one)';

function matchNamedItem(text: string, items: readonly NamedItem[]): Command | null {
  if (!WEAR_VERB.test(text)) return null;
  const action: 'show' | 'select' = SELECT_VERB.test(text) ? 'select' : 'show';
  // The full name wins outright; a colour plus category word is the fallback.
  for (const item of items) {
    const name = normalise(item.name);
    if (name && text.includes(name)) return { type: 'item', id: item.id, action };
  }
  for (const item of items) {
    const color = normalise(item.color);
    if (color && new RegExp(`\\b${color.replace(/[^a-z0-9 ]/g, '')}\\b`).test(text) && CATEGORY_WORDS[item.category].test(text)) {
      return { type: 'item', id: item.id, action };
    }
  }
  return null;
}

/**
 * Turns plain words into a closet command, or null when the words should go to
 * the assistant. Word-count guards stop longer questions ("what should I wear
 * next week") from being swallowed by a one-word command.
 */
export function parseCommand(input: string, items: readonly NamedItem[] = []): Command | null {
  const text = normalise(input);
  if (!text) return null;
  const words = text.split(' ').length;

  if (/^daddy(?:'s|s| is)? home$/.test(text)) return { type: 'welcome-home' };
  if (/^(?:(?:let's|lets|let us|i want to|can we) )?try (?:on )?(?:some )?(?:clothes|close|outfits)(?: on)?$/.test(text)) return { type: 'try-clothes' };
  if (/\b(stop listening|stop voice|go to sleep|mute microphone)\b/.test(text)) return { type: 'stop-listening' };
  if (/\b(start listening|turn on voice)\b/.test(text)) return { type: 'start-listening' };

  if (/\b(close|hide|dismiss)\b.*\b(closet|wardrobe)\b/.test(text)) return { type: 'close-closet' };

  if (/\b(add|save|put)\b.*\b(closet|wardrobe)\b/.test(text) || /^(add|save) (this|that|it)$/.test(text)) {
    return { type: 'add-to-closet' };
  }

  if (text === 'try on' || /\bgenerate\b.*\btry ?-?on\b/.test(text)) return { type: 'generate-tryon' };
  if (/\b(try|wear|preview)\b.*\b(holding|held garment|held piece)\b/.test(text)) return { type: 'try-held' };
  if (words <= 6 && /\b(take|snap|grab|capture)\b.*\b(photo|picture|pic|selfie)\b/.test(text)) return { type: 'take-photo' };
  if (text === 'photo') return { type: 'take-photo' };

  if (words <= 5 && /\b(start|turn on|open)\b.*\bcamera\b/.test(text)) return { type: 'start-camera' };
  if (words <= 5 && /\b(stop|turn off|close)\b.*\bcamera\b/.test(text)) return { type: 'stop-camera' };
  if (words <= 6 && /\b(start|turn on|enable)\b.*\b(hand|gesture)/.test(text)) return { type: 'hand-on' };
  if (words <= 6 && /\b(stop|turn off|disable)\b.*\b(hand|gesture)/.test(text)) return { type: 'hand-off' };
  if (words <= 4 && /\b(hide|remove)\b.*\boverlay\b/.test(text)) return { type: 'hide-overlay' };
  if (words <= 4 && /\bshow\b.*\boverlay\b/.test(text)) return { type: 'show-overlay' };

  if (/\bhow do i look\b/.test(text)) return { type: 'look' };

  const named = matchNamedItem(text, items);
  if (named) return named;

  if (new RegExp(`\\b(try|wear|put)( on)? ${DEICTIC}( on)?\\b`).test(text)) return { type: 'select' };
  if (new RegExp(`^(please )?(select|choose|pick)( ${DEICTIC})?( please)?$`).test(text)) return { type: 'select' };

  if (words <= 4 && /\b(next|another|forward)\b/.test(text)) return { type: 'next' };
  if (words <= 4 && /\b(previous|prev|go back|last one)\b/.test(text)) return { type: 'previous' };
  if (text === 'back') return { type: 'previous' };

  if (words <= 9) {
    const hits = (Object.keys(CATEGORY_WORDS) as CategoryName[]).filter((name) => CATEGORY_WORDS[name].test(text));
    if (hits.length === 1 && (words <= 2 || SEE_VERB.test(text))) return { type: 'category', category: hits[0] };
  }

  if (/\b(closet|wardrobe)\b/.test(text) && (words <= 2 || SEE_VERB.test(text) || /\blook\b/.test(text))) {
    return { type: 'open-closet' };
  }

  if (words <= 4 && /\b(help|what can (i|you) (say|do)|show settings|open settings|settings)\b/.test(text)) return { type: 'help' };

  return null;
}

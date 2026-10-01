const L33T_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
};

// Keep this list intentionally small and focused on common profanity.
// Avoid hate slurs; this is meant for general "cursing" / offensive language.
const BANNED_TOKENS = new Set([
  // English
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'pussy',
  'cunt',
  // French
  'merde',
  'putain',
  'connard',
  'salope',
]);

function normalize(text: string): string {
  const lowered = (text ?? '').toLowerCase();

  // Remove diacritics (é -> e, etc.)
  const noMarks = lowered
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  // Replace common leetspeak and punctuation obfuscation
  const mapped = noMarks
    .split('')
    .map((ch) => L33T_MAP[ch] ?? ch)
    .join('');

  // Keep letters/numbers, convert everything else to spaces
  return mapped
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the first banned token detected (normalized), or null if clean.
 */
export function findOffensiveToken(input: string): string | null {
  const norm = normalize(input);
  if (!norm) return null;

  const tokens = norm.split(' ').filter(Boolean);
  for (const token of tokens) {
    if (BANNED_TOKENS.has(token)) return token;

    // Handle basic obfuscations like fuuuck / shiiit by collapsing repeats.
    const collapsed = token.replace(/(.)\1{2,}/g, '$1$1');
    if (BANNED_TOKENS.has(collapsed)) return collapsed;
  }

  return null;
}

export function containsOffensiveLanguage(input: string): boolean {
  return findOffensiveToken(input) !== null;
}

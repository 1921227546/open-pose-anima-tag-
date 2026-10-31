import lexiconData from '../data/anima-lexicon.json';
import type { Reference } from './types';

/**
 * Prompt conventions for CircleStone Labs' Anima 1.0 Base.
 * The model mixes Danbooru tags with natural language, writes tags in lowercase
 * with spaces instead of underscores, and takes a real negative prompt.
 */
export interface AnimaProfile {
  model: string;
  quality: string[];
  rating: string;
  resolution: string;
  style: string[];
  negative: string;
  subject: { single: string; pair: string };
  framing: { upper: string; full: string };
  angles: Record<string, string[]>;
  categories: Record<string, string[]>;
  costumeModifiers: string[];
  costumeHeads: string[];
  costume: Record<string, string>;
  phrases: [string, string[]][];
  overrides: Record<string, string[]>;
}

export interface AnimaInput {
  pose?: Reference;
  costume?: Reference;
  angle?: string;
}

export const animaProfile = lexiconData as unknown as AnimaProfile;
export const animaModelName = animaProfile.model;

// Patterns only use letters, hyphens and apostrophes, so no regex escaping is needed.
const phrases = [...animaProfile.phrases]
  .sort((a, b) => b[0].length - a[0].length)
  .map(
    ([pattern, tags]) =>
      [new RegExp(`(^|[^a-z0-9])${pattern}s?(?=[^a-z0-9]|$)`, 'g'), tags] as const,
  );
const modifiers = new Set(animaProfile.costumeModifiers);
const heads = new Set(animaProfile.costumeHeads);
const stances = new Set([
  'standing',
  'sitting',
  'kneeling',
  'lying',
  'squatting',
  'all fours',
  'wariza',
  'seiza',
  'bridge',
  'split',
]);
const pairSeries = 'two figures';
const upperSeries = 'upper body';

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = value.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function seriesKey(item: Reference): string {
  return item.series.en.trim().toLowerCase();
}

function isPair(item: Reference): boolean {
  return seriesKey(item) === pairSeries;
}

/**
 * Rewrite an English pose or costume title into tags. Patterns are tried longest
 * first and consume the text they matched, so "hands behind head" never also
 * yields "arms behind back" from the same words.
 */
export function matchPhraseTags(title: string): string[] {
  let rest = title.toLowerCase().replace(/[’/]/g, ' ');
  const tags: string[] = [];
  for (const [pattern, values] of phrases) {
    rest = rest.replace(pattern, (_match, prefix: string) => {
      tags.push(...values);
      return `${prefix} §`;
    });
  }
  return dedupe(tags);
}

/** Join garment modifiers with the head noun they describe: "pleated mini skirt". */
export function costumeTags(item: Reference): string[] {
  const tokens = (item.keywords.en || item.title.en)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && token !== '/');
  const slots: (string | undefined)[] = new Array(tokens.length);
  for (let index = 0; index < tokens.length; index++) {
    if (slots[index] || !heads.has(tokens[index]!)) continue;
    let start = index;
    while (start > index - 3 && modifiers.has(tokens[start - 1]!) && !slots[start - 1]) start--;
    slots[start] = tokens.slice(start, index + 1).join(' ');
    for (let step = start; step <= index; step++) if (!slots[step]) slots[step] = '';
  }
  for (let index = 0; index < tokens.length; index++) {
    if (slots[index] !== undefined) continue;
    slots[index] = animaProfile.costume[tokens[index]!];
  }
  return dedupe(slots.filter((tag): tag is string => !!tag));
}

export function poseTags(item: Reference, angle?: string): string[] {
  const phraseTags = matchPhraseTags(item.title.en);
  // A category is a browsing bucket, not a stance: when the title already names
  // the stance ("side lying", "W-sitting"), that reading wins over the bucket.
  const named = phraseTags.some((tag) => stances.has(tag));
  const categoryTags = (animaProfile.categories[item.category.id] ?? []).filter(
    (tag) => !(named && stances.has(tag)),
  );
  const derived = animaProfile.overrides[item.id] ?? [...categoryTags, ...phraseTags];
  const angleTags = angle ? (animaProfile.angles[angle] ?? []) : [];
  return dedupe([...derived, ...angleTags]);
}

/** The full Danbooru-style tag prompt for a pose, a costume, or both. */
export function animaTags(input: AnimaInput): string[] {
  const { pose, costume, angle } = input;
  const subject = pose && isPair(pose) ? animaProfile.subject.pair : animaProfile.subject.single;
  const framing = pose
    ? seriesKey(pose) === upperSeries
      ? animaProfile.framing.upper
      : animaProfile.framing.full
    : '';
  return dedupe([
    ...animaProfile.quality,
    animaProfile.rating,
    animaProfile.resolution,
    ...subject.split(','),
    framing,
    ...(pose ? poseTags(pose, angle) : []),
    ...(costume ? costumeTags(costume) : []),
    ...animaProfile.style,
  ]);
}

export function animaTagPrompt(input: AnimaInput): string {
  return animaTags(input).join(', ');
}

export function animaNegativePrompt(): string {
  return animaProfile.negative;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function article(text: string): string {
  return /^[aeiou]/.test(text) ? 'an' : 'a';
}

function outfitPhrase(costume: Reference): string {
  const title = lowerFirst(costume.title.en).replace(/\s*\/\s*/g, ' and a ');
  return `wearing ${article(title)} ${title}`;
}

const angleSentences: Record<string, string> = {
  high: 'High-angle shot, seen from above.',
  low: 'Low-angle shot, seen from below.',
  side: 'Side view.',
  diag: 'Three-quarter angle.',
};

/** Tags plus the two to four natural-language sentences Anima expects after them. */
export function animaHybridPrompt(input: AnimaInput): string {
  const { pose, costume, angle } = input;
  const who = pose && isPair(pose) ? 'Two young anime women' : 'A young anime woman';
  let subjectLine = who;
  if (pose) subjectLine += `, ${lowerFirst(pose.title.en)}`;
  if (costume) subjectLine += `, ${outfitPhrase(costume)}`;
  const sentences = [`${subjectLine}.`];
  const framing = pose
    ? seriesKey(pose) === upperSeries
      ? 'Upper body framing.'
      : 'Full body.'
    : '';
  if (framing) sentences.push(framing);
  const angleSentence = angle ? angleSentences[angle] : '';
  if (angleSentence) sentences.push(angleSentence);
  sentences.push('Clean lineart, soft shading.');
  return `${animaTagPrompt(input)}\n\n${sentences.join(' ')}`;
}

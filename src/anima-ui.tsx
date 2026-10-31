import { Ban, Tags, Wand2 } from 'lucide-react';
import { animaHybridPrompt, animaModelName, animaNegativePrompt, animaTagPrompt } from './anima';
import type { AnimaInput } from './anima';
import { copy } from './i18n';
import type { Lang } from './types';

/**
 * Copy actions for the Anima 1.0 Base tag conventions. They only derive text
 * from the selected reference, so the library data and images stay untouched.
 */
export function AnimaActions({
  input,
  lang,
  onCopy,
}: {
  input: AnimaInput;
  lang: Lang;
  onCopy: (value: string) => void;
}) {
  const t = copy[lang];
  const tags = animaTagPrompt(input);
  if (!tags) return null;
  const hint = `${t.animaHint} · ${animaModelName}`;
  return (
    <>
      <button className="text-action" title={hint} onClick={() => onCopy(tags)}>
        <Tags size={14} />
        {t.copyAnimaTags}
      </button>
      <button className="text-action" title={hint} onClick={() => onCopy(animaHybridPrompt(input))}>
        <Wand2 size={14} />
        {t.copyAnimaPrompt}
      </button>
      <button className="text-action" title={hint} onClick={() => onCopy(animaNegativePrompt())}>
        <Ban size={14} />
        {t.copyAnimaNegative}
      </button>
    </>
  );
}

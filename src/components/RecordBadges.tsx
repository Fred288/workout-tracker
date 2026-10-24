import { BADGE_LABELS } from '../lib/recordLabels';
import type { RecordKind } from '../lib/records';

/** Small "PR" chips; text plus trophy so the meaning never depends on color alone. */
export default function RecordBadges({ kinds }: { kinds: RecordKind[] }) {
  if (!kinds.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {kinds.map((k) => (
        <span key={k} className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          🏆 PR {BADGE_LABELS[k]}
        </span>
      ))}
    </span>
  );
}

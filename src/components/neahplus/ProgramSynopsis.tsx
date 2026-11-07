import { useMemo } from 'react';
import { Clock, Tv } from 'lucide-react';
import type { NeahplusChannel } from './neahplusCatalog';
import { currentProgram } from './neahplusCatalog';
import {
  formatRemaining,
  formatTime,
  getNextProgram,
} from './neahplusTvUtils';

interface ProgramSynopsisProps {
  channel: NeahplusChannel | null;
  channelDisplayName: string;
  now: number;
}

const ProgramSynopsis = ({ channel, channelDisplayName, now }: ProgramSynopsisProps) => {
  const current = useMemo(() => (channel ? currentProgram(channel, now) : null), [channel, now]);
  const next = useMemo(() => (channel ? getNextProgram(channel, now) : null), [channel, now]);

  if (!channel) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
        <Tv className="h-4 w-4 text-white/25" />
        <p className="text-sm text-white/35">Sélectionnez une chaîne pour voir les informations du programme.</p>
      </div>
    );
  }

  return (
    <div className="flex touch-pan-y flex-col gap-2.5 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Tv className="h-4 w-4 shrink-0 text-red-400" />
        <h3 className="truncate text-sm font-bold tracking-tight text-white">{channelDisplayName}</h3>
      </div>

      {current ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              En direct
            </span>
            <p className="truncate text-sm font-bold text-white">{current.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/50">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3" />
              {formatTime(current.start)} – {formatTime(current.end)}
            </span>
            <span className="text-red-300/70">{formatRemaining(current.end, now)}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/40">Aucun programme en cours actuellement.</p>
      )}

      {next && (
        <div className="flex items-center gap-2 border-t border-white/[0.06] pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/35">Suivant</span>
          <p className="truncate text-xs text-white/55">
            {next.title} — {formatTime(next.start)}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProgramSynopsis;

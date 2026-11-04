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
}

const ProgramSynopsis = ({ channel, channelDisplayName }: ProgramSynopsisProps) => {
  const now = Date.now();
  const current = useMemo(() => (channel ? currentProgram(channel, now) : null), [channel, now]);
  const next = useMemo(() => (channel ? getNextProgram(channel, now) : null), [channel, now]);

  if (!channel) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <Tv className="h-4 w-4 text-white/30" />
        <p className="text-sm text-white/40">Sélectionnez une chaîne pour voir les informations du programme.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-2">
        <Tv className="h-4 w-4 shrink-0 text-red-400" />
        <h3 className="truncate text-sm font-bold text-white">{channelDisplayName}</h3>
      </div>

      {current ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              En cours
            </span>
            <p className="truncate text-sm font-semibold text-white">{current.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/55">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(current.start)} – {formatTime(current.end)}
            </span>
            <span className="text-red-300/80">{formatRemaining(current.end, now)}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/45">Aucun programme en cours actuellement.</p>
      )}

      {next && (
        <div className="mt-0.5 flex items-center gap-2 border-t border-white/5 pt-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Suivant</span>
          <p className="truncate text-xs text-white/60">
            {next.title} — {formatTime(next.start)}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProgramSynopsis;

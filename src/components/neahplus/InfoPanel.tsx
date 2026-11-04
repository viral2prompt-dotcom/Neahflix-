import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  X,
} from 'lucide-react';
import type { NeahplusChannel } from './neahplusCatalog';
import { currentProgram } from './neahplusCatalog';
import {
  formatDuration,
  formatRemaining,
  formatTime,
  getEpgDates,
  getNextProgram,
  getProgramsForDay,
  getUpcomingPrograms,
} from './neahplusTvUtils';

interface InfoPanelProps {
  channel: NeahplusChannel | null;
  channelDisplayName: string;
  onClose: () => void;
}

const InfoPanel = ({ channel, channelDisplayName, onClose }: InfoPanelProps) => {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const now = Date.now();

  const epgDates = useMemo(() => (channel ? getEpgDates(channel) : []), [channel]);

  useEffect(() => {
    if (epgDates.length === 0) return;
    const today = new Date();
    const hasToday = epgDates.some(
      (d) =>
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate(),
    );
    if (!hasToday) {
      const first = epgDates[0];
      if (first) setSelectedDate(first);
    }
  }, [epgDates]);

  const current = useMemo(() => (channel ? currentProgram(channel, now) : null), [channel, now]);
  const next = useMemo(() => (channel ? getNextProgram(channel, now) : null), [channel, now]);
  const dayPrograms = useMemo(
    () => (channel ? getProgramsForDay(channel, selectedDate) : []),
    [channel, selectedDate],
  );
  const upcoming = useMemo(
    () => (channel ? getUpcomingPrograms(channel, selectedDate, now) : []),
    [channel, selectedDate, now],
  );

  const isToday = useMemo(() => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  }, [selectedDate]);

  const shiftDate = (direction: 1 | -1) => {
    setSelectedDate((d) => new Date(d.getTime() + direction * 86400000));
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-panel-title"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-red-500/20 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-red-950/30 to-transparent px-5 py-4">
          <h2 id="info-panel-title" className="flex items-center gap-2 text-lg font-bold text-white">
            <Info className="h-5 w-5 text-red-400" />
            {channelDisplayName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {current && (
          <div className="border-b border-white/10 px-5 py-4">
            <span className="inline-block rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              En cours
            </span>
            <h3 className="mt-2 text-base font-bold text-white">{current.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/55">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(current.start)} – {formatTime(current.end)}
              </span>
              <span>{formatDuration(current.start, current.end)}</span>
              <span className="text-red-300/80">{formatRemaining(current.end, now)}</span>
            </div>
          </div>
        )}

        {next && (
          <div className="border-b border-white/10 px-5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Programme suivant</span>
            <p className="mt-1 text-sm font-semibold text-white/90">{next.title}</p>
            <p className="mt-0.5 text-xs text-white/50">
              {formatTime(next.start)} – {formatTime(next.end)} • {formatDuration(next.start, next.end)}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2.5">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="rounded-lg bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10"
            aria-label="Jour précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Calendar className="h-3.5 w-3.5 text-red-400" />
            {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="rounded-lg bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10"
            aria-label="Jour suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            className="ml-auto rounded-lg bg-white/5 px-2 py-1 text-xs text-white/60 transition hover:bg-white/10"
          >
            Aujourd'hui
          </button>
        </div>

        <div className="min-h-[10rem] flex-1 overflow-y-auto px-3 py-2">
          {dayPrograms.length === 0 ? (
            <p className="p-6 text-center text-sm text-white/45">
              Aucun programme disponible pour cette date.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(isToday ? upcoming : dayPrograms).map((p) => {
                const isCurrent = current && p.title === current.title &&
                  p.start === current.start && p.end === current.end;
                const startMs = Date.parse(p.start);
                const isPast = isToday && startMs < now && !isCurrent;
                return (
                  <li key={`${p.start}-${p.title}`}>
                    <div
                      className={`flex items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                        isCurrent
                          ? 'bg-red-500/10 ring-1 ring-red-500/30'
                          : isPast
                            ? 'opacity-40'
                            : 'hover:bg-white/5'
                      }`}
                    >
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${isCurrent ? 'text-red-300' : 'text-white/60'}`}>
                        {formatTime(p.start)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm ${isCurrent ? 'font-bold text-white' : 'font-medium text-white/85'}`}>
                          {p.title}
                        </p>
                        <p className="text-xs text-white/40">
                          {formatTime(p.start)} – {formatTime(p.end)} • {formatDuration(p.start, p.end)}
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-300">
                          Live
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {epgDates.length > 0 && (
          <div className="border-t border-white/10 px-5 py-2 text-center text-[10px] text-white/35">
            Données EPG disponibles : {epgDates.length} jour{epgDates.length > 1 ? 's' : ''}
            {epgDates.length > 0 && (
              <> • du {epgDates[0]!.toLocaleDateString('fr-FR')} au {epgDates[epgDates.length - 1]!.toLocaleDateString('fr-FR')}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InfoPanel;

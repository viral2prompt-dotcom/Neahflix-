import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { NeahplusChannel } from './neahplusCatalog';

interface NeahplusVirtualizedRowProps {
  channels: NeahplusChannel[];
  renderCard: (channel: NeahplusChannel) => ReactNode;
  label: string;
  className: string;
  setRowElement: (element: HTMLDivElement | null) => void;
}

const OVERSCAN_CARDS = 3;
const INITIAL_CARD_WINDOW = 12;

const NeahplusVirtualizedRow = ({
  channels,
  renderCard,
  label,
  className,
  setRowElement,
}: NeahplusVirtualizedRowProps) => {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [windowRange, setWindowRange] = useState(() => ({
    start: 0,
    end: Math.min(channels.length, INITIAL_CARD_WINDOW),
    pitch: 0,
    gap: 0,
  }));

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;

    let frame = 0;

    const updateWindow = () => {
      frame = 0;
      const firstCard = row.querySelector<HTMLElement>('[data-neahplus-channel-id]');
      const viewportWidth = row.clientWidth;
      if (!firstCard || viewportWidth <= 0 || channels.length === 0) return;

      const cardWidth = firstCard.getBoundingClientRect().width;
      const gap = Number.parseFloat(window.getComputedStyle(row).columnGap) || 0;
      const pitch = cardWidth + gap;
      if (pitch <= 0) return;

      const visibleStart = Math.floor(row.scrollLeft / pitch);
      const visibleEnd = Math.ceil((row.scrollLeft + viewportWidth) / pitch);
      const start = Math.max(0, visibleStart - OVERSCAN_CARDS);
      const end = Math.min(channels.length, visibleEnd + OVERSCAN_CARDS);

      setWindowRange((current) => (
        current.start === start
        && current.end === end
        && current.pitch === pitch
        && current.gap === gap
          ? current
          : { start, end, pitch, gap }
      ));
    };

    const scheduleUpdate = () => {
      if (frame === 0) frame = window.requestAnimationFrame(updateWindow);
    };

    row.addEventListener('scroll', scheduleUpdate, { passive: true });
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleUpdate)
      : null;
    resizeObserver?.observe(row);
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    scheduleUpdate();

    return () => {
      row.removeEventListener('scroll', scheduleUpdate);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [channels]);

  const start = Math.min(windowRange.start, channels.length);
  const end = Math.max(start, Math.min(windowRange.end, channels.length));
  const leadingSpace = start > 0 && windowRange.pitch > 0
    ? Math.max(0, start * windowRange.pitch - windowRange.gap)
    : 0;
  const trailingSpace = end < channels.length && windowRange.pitch > 0
    ? Math.max(0, (channels.length - end) * windowRange.pitch - windowRange.gap)
    : 0;

  return (
    <div
      ref={(element) => {
        rowRef.current = element;
        setRowElement(element);
      }}
      className={className}
      aria-label={label}
      data-neahplus-virtualized-count={channels.length}
    >
      {leadingSpace > 0 && (
        <div aria-hidden="true" className="shrink-0" style={{ width: leadingSpace }} />
      )}
      {channels.slice(start, end).map(renderCard)}
      {trailingSpace > 0 && (
        <div aria-hidden="true" className="shrink-0" style={{ width: trailingSpace }} />
      )}
    </div>
  );
};

export default NeahplusVirtualizedRow;

import React from 'react';

interface NeahflixPlaybackLoaderProps {
  message: string;
}

/** Signature affichée uniquement pendant la préparation d'une lecture. */
const NeahflixPlaybackLoader: React.FC<NeahflixPlaybackLoaderProps> = ({ message }) => (
  <div className="flex h-full min-h-[16rem] flex-col items-center justify-center overflow-hidden bg-[#03050b] px-6 text-center text-white" role="status" aria-live="polite">
    <div className="relative">
      <div className="absolute -inset-14 rounded-full bg-gradient-to-r from-blue-500/20 via-emerald-400/15 to-red-500/20 blur-3xl animate-pulse" aria-hidden="true" />
      <p className="relative text-3xl font-black tracking-[0.24em] text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-200 to-emerald-300 animate-[neahflix-wordmark_2.8s_ease-in-out_infinite] sm:text-5xl">NEAHFLIX</p>
      <div className="relative mx-auto mt-5 h-px w-44 overflow-hidden bg-white/15">
        <span className="block h-full w-1/2 bg-gradient-to-r from-transparent via-sky-300 to-emerald-300 animate-[neahflix-playback-loading_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
    <p className="mt-5 text-sm font-medium tracking-wide text-white/65">{message}</p>
    <style>{`@keyframes neahflix-playback-loading { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } } @keyframes neahflix-wordmark { 0%,100% { transform: translateY(0); filter: brightness(1); } 50% { transform: translateY(-3px); filter: brightness(1.16); } }`}</style>
  </div>
);

export default NeahflixPlaybackLoader;

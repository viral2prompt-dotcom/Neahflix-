import React from 'react';

/** Chargement neutre d'une fiche : la signature Neahflix est réservée à la préparation de lecture. */
const DetailsSkeleton: React.FC = () => (
  <div className="min-h-screen bg-[#03050b] text-white flex items-center justify-center px-6 overflow-hidden">
    <div className="relative text-center" role="status" aria-live="polite">
      <div className="absolute -inset-16 rounded-full bg-sky-600/10 blur-3xl animate-pulse" aria-hidden="true" />
      <div className="relative mx-auto h-11 w-11 rounded-full border-2 border-white/15 border-t-sky-300 animate-spin" aria-hidden="true" />
      <div className="relative mt-5 mx-auto h-px w-44 overflow-hidden bg-white/15">
        <span className="block h-full w-1/2 bg-gradient-to-r from-transparent via-sky-300 to-white animate-[detail-loading_1.4s_ease-in-out_infinite]" />
      </div>
      <p className="relative mt-4 text-sm tracking-[0.2em] uppercase text-white/55">Chargement de la fiche</p>
      <style>{`@keyframes detail-loading { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
    </div>
  </div>
);

export default DetailsSkeleton;

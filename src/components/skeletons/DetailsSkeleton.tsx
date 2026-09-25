import React from 'react';

/** A lightweight, brand-forward transition while a content sheet is refreshed. */
const DetailsSkeleton: React.FC = () => (
  <div className="min-h-screen bg-[#03050b] text-white flex items-center justify-center px-6 overflow-hidden">
    <div className="relative text-center" role="status" aria-live="polite">
      <div className="absolute -inset-16 rounded-full bg-red-600/15 blur-3xl animate-pulse" aria-hidden="true" />
      <p className="relative text-4xl sm:text-6xl font-black tracking-[0.24em] text-transparent bg-clip-text bg-gradient-to-r from-white via-red-300 to-red-600 animate-pulse">
        NEAHFLIX
      </p>
      <div className="relative mt-5 mx-auto h-px w-44 overflow-hidden bg-white/15">
        <span className="block h-full w-1/2 bg-gradient-to-r from-transparent via-red-500 to-white animate-[neahflix-loading_1.4s_ease-in-out_infinite]" />
      </div>
      <p className="relative mt-4 text-sm tracking-[0.2em] uppercase text-white/55">Préparation de votre séance</p>
      <style>{`@keyframes neahflix-loading { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
    </div>
  </div>
);

export default DetailsSkeleton;

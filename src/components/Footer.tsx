import React from 'react';
import './Footer.css';

interface FooterProps {
  isIntegration?: boolean;
}

const Footer: React.FC<FooterProps> = ({ isIntegration = false }) => {
  if (isIntegration) {
    return (
      <footer className="relative z-10 mt-10 border-t border-white/[0.08] bg-slate-950/70 px-5 pb-28 pt-9 text-slate-400 backdrop-blur-sm lg:pb-9">
        <div className="mx-auto max-w-3xl text-center">
          <p className="neahflix-footer-mark">NEAHFLIX</p>
          <p className="mx-auto mt-4 max-w-2xl text-xs leading-6 text-slate-400">« Le plaisir du cinéma à un prix juste. »</p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative z-10 mt-10 border-t border-white/[0.08] bg-slate-950/70 px-5 pb-28 pt-9 text-slate-400 backdrop-blur-sm lg:pb-9">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-red-400/70" />
          <span className="neahflix-footer-mark">NEAHFLIX</span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-blue-300/60" />
        </div>
        <p className="mx-auto max-w-2xl text-xs leading-6 text-slate-400">« Le plaisir du cinéma à un prix juste. »</p>
        <p className="mt-3 text-xs leading-6 text-slate-400">Merci à Mysticsaba pour son soutien et sa confiance dans l&apos;aventure Neahflix.</p>
        <p className="mt-5 text-xs text-slate-500">@NGB23 — NEAHFLIX CREATOR / CODE CG242 |©✓</p>
      </div>
    </footer>
  );
};

export default Footer;

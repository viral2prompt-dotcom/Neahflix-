import React from 'react';

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
      <section
        className="neahflix-lightfall relative mx-4 mt-12 overflow-hidden rounded-3xl border border-sky-100/15 px-6 py-10 text-center shadow-2xl shadow-sky-950/30 md:mx-8 md:px-12"
        aria-label="Crédits Neahflix"
      >
        <div className="relative z-10 mx-auto max-w-2xl">
          <p className="font-serif text-xs tracking-[0.42em] text-sky-100/70">
            NEAHFLIX
          </p>
          <p className="mt-4 font-serif text-2xl text-white sm:text-3xl">
            « Le plaisir du cinéma à un prix juste. »
          </p>
          <p className="mt-5 text-sm leading-relaxed text-slate-300">
            Merci à Mysticsaba pour sa confiance dans l&apos;aventure Neahflix.
          </p>
          <p className="mt-7 text-xs font-medium tracking-[0.14em] text-white">
            @NGB23 — NEAHFLIX CREATOR / CODE CG242 |©✓
          </p>
        </div>
      </section>

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <p className="neahflix-footer-mark">NEAHFLIX</p>
        <p className="mx-auto mt-4 max-w-2xl text-xs leading-6 text-slate-400">Neahflix n&apos;héberge aucun fichier sur ses serveurs. Nous fournissons uniquement des liens vers des services externes. Nous ne sommes pas responsables du contenu hébergé par ces services tiers. En cas de problème avec la justice, veuillez contacter directement les hébergeurs des contenus concernés.</p>
        <p className="mt-7 text-xs font-medium tracking-[0.14em] text-slate-300">© 2026 Neahflix. Tous droits réservés.</p>
      </div>
    </footer>
  );
};

export default Footer;

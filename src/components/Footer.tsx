import React from 'react';
import { useTranslation } from 'react-i18next';
import './Footer.css';

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer className="relative z-10 mt-10 border-t border-white/[0.08] bg-slate-950/70 px-5 pb-28 pt-9 text-slate-400 backdrop-blur-sm lg:pb-9">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-red-400/70" />
          <span className="neahflix-footer-mark">NEAHFLIX</span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-blue-300/60" />
        </div>
        <p className="mx-auto max-w-2xl text-xs leading-6 text-slate-400">{t('footer.disclaimerText')}</p>
        <p className="mt-5 text-xs text-slate-500">© {new Date().getFullYear()} Neahflix. {t('footer.allRightsReserved')}</p>
      </div>
    </footer>
  );
};

export default Footer;

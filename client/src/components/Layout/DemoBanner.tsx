import React, { useEffect, useState } from 'react';
import { PlayCircle, Download, LogOut, Phone, Mail, Globe, X } from 'lucide-react';
import { QuoteFlowMark } from '../common/QuoteFlowLogo';

const CONTACT = { phone: '0997 235 271', tel: '+265997235271', email: 'info@orbitalitsolutions.com', web: 'orbitalitsolutions.com' };

/**
 * Shown to visitors of the public read-only demo: a slim banner above every
 * page, and a dialog whenever they try to save something (the API answers
 * those with 403 + `demo: true`; services/api.ts raises the event).
 */
const DemoBanner: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const show = () => setBlocked(true);
    window.addEventListener('quoteflow:demo-blocked', show);
    return () => window.removeEventListener('quoteflow:demo-blocked', show);
  }, []);

  return (
    <>
      <div className="no-print bg-gradient-to-r from-indigo-600 to-cyan-600 text-white px-6 py-2 flex items-center justify-between gap-3 text-sm flex-wrap">
        <span className="flex items-center min-w-0 gap-2">
          <PlayCircle className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">
            <b>QuoteFlow live demo</b>: explore freely with sample data. Changes are not saved.
          </span>
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <a href={`tel:${CONTACT.tel}`} className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25">
            <Phone className="h-3.5 w-3.5" /> {CONTACT.phone}
          </a>
          <a href="/QuoteFlow-Brochure.pdf" download className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25">
            <Download className="h-3.5 w-3.5" /> Brochure
          </a>
          <button onClick={onExit} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-indigo-700 font-medium hover:bg-indigo-50">
            <LogOut className="h-3.5 w-3.5" /> Exit demo
          </button>
        </span>
      </div>

      {blocked && (
        <div className="fixed inset-0 z-[60] bg-gray-900/50 flex items-center justify-center p-4" onClick={() => setBlocked(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setBlocked(false)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
            <QuoteFlowMark size={44} />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">This is the demo, so nothing is saved</h3>
            <p className="mt-1 text-sm text-gray-600">
              Feel free to explore every page and document. When you have your own QuoteFlow system, everything you
              create is saved, branded with your logo and shared with your team.
            </p>
            <div className="mt-5 rounded-xl bg-gray-50 p-4 space-y-2 text-sm">
              <p className="font-semibold text-gray-900">Get QuoteFlow from Orbital IT Solutions</p>
              <a href={`tel:${CONTACT.tel}`} className="flex items-center gap-2 text-gray-700 hover:text-indigo-700"><Phone className="h-4 w-4 text-indigo-600" /> {CONTACT.phone}</a>
              <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 text-gray-700 hover:text-indigo-700"><Mail className="h-4 w-4 text-indigo-600" /> {CONTACT.email}</a>
              <a href={`https://${CONTACT.web}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-700 hover:text-indigo-700"><Globe className="h-4 w-4 text-indigo-600" /> {CONTACT.web}</a>
            </div>
            <button onClick={() => setBlocked(false)} className="mt-5 w-full py-2.5 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700">
              Continue exploring
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DemoBanner;

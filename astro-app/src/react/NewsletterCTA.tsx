import { useState } from 'react';
import { saveLeadMagnetLead } from '../lib/firebase-client';

const BOOKING_LINK = 'https://api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN';

export default function NewsletterCTA() {
  const [step, setStep] = useState<'idle' | 'form' | 'done'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', email: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.email.trim()) {
      setError('Nombre y email son obligatorios');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await saveLeadMagnetLead({
        nombre: formData.nombre.trim(),
        email: formData.email.trim(),
        tag: 'newsletter-blog',
        magnetSlug: 'newsletter',
        magnetTitle: 'Newsletter Growth4U',
      });
      // Track Meta Pixel Lead event
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'Lead', { content_name: 'Newsletter', content_category: 'newsletter' });
      }
      setStep('done');
    } catch (err) {
      console.error('Error saving newsletter lead:', err);
      setError('Hubo un problema. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'done') {
    const firstName = formData.nombre.split(' ')[0];
    return (
      <div className="my-10 bg-gradient-to-br from-[#032149] to-[#0a2d5c] rounded-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-400/20 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <p className="font-bold text-lg">¡Listo, {firstName}! Ya estás dentro.</p>
        </div>
        <p className="text-white/70 text-sm mb-6 leading-relaxed">
          Recibirás el primer email en los próximos minutos. Cada semana, una guía práctica
          sobre growth fintech directamente en tu bandeja.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="/blog/"
            className="flex-1 text-center px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl text-sm transition-all"
          >
            ← Explorar más artículos
          </a>
          <a
            href={BOOKING_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center px-5 py-3 bg-[#6351d5] hover:bg-[#5242b8] text-white font-semibold rounded-xl text-sm transition-all"
          >
            Reservar consulta gratuita →
          </a>
        </div>
      </div>
    );
  }

  if (step === 'form') {
    return (
      <div className="my-10 bg-[#6351d5]/5 border border-[#6351d5]/20 rounded-2xl p-6">
        <p className="font-bold text-[#032149] mb-1">Suscríbete a la newsletter</p>
        <p className="text-slate-500 text-sm mb-4">Una vez por semana. Sin spam. Puedes darte de baja cuando quieras.</p>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Tu nombre"
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent bg-white text-sm"
            required
          />
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="tu@empresa.com"
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent bg-white text-sm"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-all whitespace-nowrap"
          >
            {submitting ? 'Enviando...' : 'Suscribirme →'}
          </button>
        </form>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="my-10 bg-[#6351d5]/5 border border-[#6351d5]/20 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#6351d5]/10 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-[#6351d5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
        </div>
        <div>
          <p className="font-bold text-[#032149] text-sm">¿Te ha gustado este artículo?</p>
          <p className="text-slate-500 text-xs">Recibe contenido como este cada semana en tu bandeja.</p>
        </div>
      </div>
      <button
        onClick={() => setStep('form')}
        className="px-5 py-2.5 bg-[#6351d5] hover:bg-[#5242b8] text-white font-bold rounded-full text-sm transition-all hover:scale-105 whitespace-nowrap"
      >
        Suscribirme gratis →
      </button>
    </div>
  );
}

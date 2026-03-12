import { useState, useEffect } from 'react';
import { marked } from 'marked';
import { saveLeadMagnetLead } from '../lib/firebase-client';

interface Props {
  magnetSlug: string;
  magnetTitle: string;
  excerpt: string;        // Markdown — visible before gate
  fullContent: string;    // HTML — shown after unlock
}

export default function StaticLeadMagnetGate({ magnetSlug, magnetTitle, excerpt, fullContent }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', email: '', empresa: '' });
  const [error, setError] = useState('');

  const storageKey = `lm_${magnetSlug}_unlocked`;

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey)) {
      setUnlocked(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
        tag: formData.empresa.trim(),
        magnetSlug,
        magnetTitle,
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, '1');
      }
      setUnlocked(true);
      setShowForm(false);
    } catch (err) {
      console.error('Error saving lead:', err);
      setError('Hubo un problema. Por favor, inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const excerptHtml = marked.parse(excerpt || '', { gfm: true }) as string;

  if (unlocked) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-2 text-green-600 text-sm font-medium">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          ¡Acceso desbloqueado! Aquí tienes el contenido completo.
        </div>
        <div dangerouslySetInnerHTML={{ __html: fullContent }} />
        <div className="mt-16 bg-[#032149] rounded-2xl p-8 text-center">
          <p className="text-white/70 text-sm font-medium uppercase tracking-wider mb-3">¿Quieres implementarlo en tu empresa?</p>
          <h3 className="text-2xl font-bold text-white mb-4">Hablamos 30 minutos y te digo dónde está tu mayor oportunidad</h3>
          <a
            href="https://api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#6351d5] hover:bg-[#5242b8] text-white font-bold py-4 px-8 rounded-full text-lg transition-all hover:scale-105 shadow-lg shadow-[#6351d5]/30"
          >
            Agendar llamada →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div className="prose prose-lg mx-auto">
          <div dangerouslySetInnerHTML={{ __html: excerptHtml }} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
      </div>

      {!showForm ? (
        <div className="mt-8">
          <div className="bg-[#6351d5]/5 border border-[#6351d5]/20 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-[#6351d5]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#6351d5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#032149] mb-2">Accede al contenido completo</h3>
            <p className="text-slate-400 text-sm mb-6">Gratis. Sin spam. Acceso inmediato.</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-[#6351d5] hover:bg-[#5242b8] text-white font-bold py-4 px-10 rounded-full text-lg transition-all duration-200 hover:scale-105 shadow-lg shadow-[#6351d5]/20"
            >
              Desbloquear →
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-8 max-w-md mx-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold text-[#032149] mb-1">Déjanos tus datos</h3>
            <p className="text-slate-500 text-sm mb-6">Acceso inmediato al contenido completo.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tu nombre *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="María García"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tu email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="maria@tuempresa.com"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tu empresa</label>
                <input
                  type="text"
                  value={formData.empresa}
                  onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                  placeholder="Nombre de tu empresa tech"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] py-3 bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-slate-300 text-white font-bold rounded-xl transition-all"
                >
                  {submitting ? 'Enviando...' : 'Acceder →'}
                </button>
              </div>
              <p className="text-slate-400 text-xs text-center">Sin spam. Puedes darte de baja cuando quieras.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

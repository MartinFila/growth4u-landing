import { useState, useEffect } from 'react';
import { marked } from 'marked';
import { saveLeadMagnetLead, getLeadMagnetById } from '../lib/firebase-client';

interface Props {
  magnetId: string;
  magnetSlug: string;
  magnetTitle: string;
  excerpt: string;
  contentUrl?: string;
}

export default function LeadMagnetGate({ magnetId, magnetSlug, magnetTitle, excerpt, contentUrl }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [formData, setFormData] = useState({ nombre: '', email: '', empresa: '' });
  const [error, setError] = useState('');

  const storageKey = `lead_magnet_unlocked_${magnetSlug}`;

  // Check token from email link
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      try {
        const decoded = atob(token);
        if (decoded.includes('@')) {
          localStorage.setItem(storageKey, '1');
          window.history.replaceState({}, '', window.location.pathname);
          fetchContent();
          return;
        }
      } catch { /* invalid token */ }
    }
    // Check localStorage
    if (localStorage.getItem(storageKey)) {
      fetchContent();
    }
  }, []);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const result = await getLeadMagnetById(magnetId);
      if (result) {
        setContent(result.content);
        setUnlocked(true);
      }
    } catch (err) {
      console.error('Error fetching content:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.email.trim()) {
      setError('Nombre y email son obligatorios');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      // Save to Firebase
      await saveLeadMagnetLead({
        nombre: formData.nombre.trim(),
        email: formData.email.trim(),
        tag: formData.empresa.trim(),
        magnetSlug,
        magnetTitle,
      });

      // Send email via GHL
      const emailContentUrl = `${window.location.origin}/recursos/${magnetSlug}/?token=${encodeURIComponent(btoa(formData.email.trim().toLowerCase()))}`;
      const resp = await fetch('/.netlify/functions/lead-magnet-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          email: formData.email.trim(),
          empresa: formData.empresa.trim(),
          magnetSlug,
          magnetTitle,
          contentUrl: emailContentUrl,
        }),
      });
      const data = await resp.json();

      setSentEmail(formData.email.trim());
      setEmailSent(true);
      setShowForm(false);

      if (!data.emailSent) {
        setError('Tu solicitud se registró pero hubo un problema enviando el email. Contacta con hola@growth4u.io');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Hubo un problema. Por favor, inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const excerptHtml = marked.parse(excerpt || '', { gfm: true }) as string;

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-flex items-center gap-3 text-slate-500">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Cargando contenido...</span>
        </div>
      </div>
    );
  }

  if (unlocked && content) {
    const contentHtml = marked.parse(content, { gfm: true }) as string;
    return (
      <div>
        <div className="mb-6 flex items-center gap-2 text-green-600 text-sm font-medium">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Acceso desbloqueado. Aquí tienes el contenido completo.
        </div>
        <div className="prose prose-lg mx-auto">
          <div dangerouslySetInnerHTML={{ __html: excerptHtml }} />
          <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
        </div>
        {contentUrl && (
          <div className="mt-10 text-center">
            <a
              href={contentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#6351d5] hover:bg-[#5242b8] text-white font-bold py-4 px-8 rounded-full text-lg transition-all hover:scale-105 shadow-lg shadow-[#6351d5]/20"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              Descargar recurso
            </a>
          </div>
        )}
        <div className="mt-16 bg-[#032149] rounded-2xl p-8 text-center">
          <p className="text-white/70 text-sm font-medium uppercase tracking-wider mb-3">¿Quieres implementarlo en tu empresa tech?</p>
          <h3 className="text-2xl font-bold text-white mb-4">Hablamos 30 minutos y te digo dónde está tu mayor oportunidad</h3>
          <a
            href="https://api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#6351d5] hover:bg-[#5242b8] text-white font-bold py-4 px-8 rounded-full text-lg transition-all hover:scale-105 shadow-lg shadow-[#6351d5]/30"
          >
            Reservar sesión gratuita →
          </a>
        </div>
      </div>
    );
  }

  // Email sent confirmation
  if (emailSent) {
    return (
      <div>
        <div className="prose prose-lg mx-auto">
          <div dangerouslySetInnerHTML={{ __html: excerptHtml }} />
        </div>
        <div className="mt-8 max-w-md mx-auto text-center">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">
            <div className="w-16 h-16 bg-[#6351d5]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📬</span>
            </div>
            <h3 className="text-xl font-bold text-[#032149] mb-2">¡Revisa tu email!</h3>
            <p className="text-slate-500 text-sm mb-2">
              Te hemos enviado el contenido completo a:
            </p>
            <p className="text-[#6351d5] font-semibold mb-4">{sentEmail}</p>
            <p className="text-slate-400 text-xs">
              Revisa tu bandeja de entrada (y spam, por si acaso).
            </p>
            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Excerpt with gradient fade */}
      <div className="relative">
        <div className="prose prose-lg mx-auto">
          <div dangerouslySetInnerHTML={{ __html: excerptHtml }} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
      </div>

      {/* Gate CTA or form */}
      {!showForm ? (
        <div className="mt-8">
          <div className="bg-[#6351d5]/5 border border-[#6351d5]/20 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-[#6351d5]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#6351d5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#032149] mb-2">Accede al contenido completo</h3>
            <p className="text-slate-400 text-sm mb-6">Gratis. Sin spam. Te lo enviamos a tu email.</p>
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
            <p className="text-slate-500 text-sm mb-6">Te enviamos el contenido completo a tu email.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tu nombre *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="María García"
                  disabled={submitting}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent disabled:opacity-50"
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
                  disabled={submitting}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent disabled:opacity-50"
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
                  disabled={submitting}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] focus:border-transparent disabled:opacity-50"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] py-3 bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-slate-300 text-white font-bold rounded-xl transition-all"
                >
                  {submitting ? 'Enviando...' : 'Recibir por email →'}
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

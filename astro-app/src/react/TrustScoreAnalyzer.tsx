import { useState, useRef, useEffect, FormEvent } from "react";

type Pillar = { score: number; findings: string[] };
type CompetitorComparison = {
  competitor_name: string;
  competitor_advantage: string;
  brand_advantage: string;
  key_gap: string;
} | null;

type Result = {
  company_name: string;
  business_type: string;
  one_liner: string;
  trust_score: number;
  pillars: Record<string, Pillar>;
  top_gaps: string[];
  serp_highlight: string;
  geo_highlight: string;
  missing_sources: string[];
  competitor_comparison: CompetitorComparison;
  verdict: string;
};

type LogEntry = { type: string; message?: string; step?: string; data?: Result };

const PILLAR_LABELS: Record<string, string> = {
  borrowed_trust: "Borrowed Trust",
  serp_trust: "SERP Trust",
  brand_assets: "Brand Assets",
  geo_presence: "GEO Presence",
  outbound_readiness: "Outbound Readiness",
  demand_engine: "Demand Engine",
};

const PILLAR_ICONS: Record<string, string> = {
  borrowed_trust: "\u{1F91D}",
  serp_trust: "\u{1F50D}",
  brand_assets: "\u{1F3A8}",
  geo_presence: "\u{1F916}",
  outbound_readiness: "\u{1F4E3}",
  demand_engine: "\u26A1",
};

const PILLAR_DESCRIPTIONS: Record<string, string> = {
  borrowed_trust: "Menciones y referencias de terceros",
  serp_trust: "Presencia y posici\u00F3n en Google",
  brand_assets: "Activos visuales y de marca",
  geo_presence: "Visibilidad en IAs generativas",
  outbound_readiness: "Preparaci\u00F3n para captar leads",
  demand_engine: "Infraestructura t\u00E9cnica de demanda",
};

const STEPS = [
  { text: "Analizando tu web...", sub: "Rastreando contenido y estructura" },
  { text: "Auditor\u00EDa SEO t\u00E9cnica...", sub: "Meta tags, schema, analytics" },
  { text: "Revisando presencia en Google...", sub: "Buscando tu marca en SERP" },
  { text: "Evaluando activos de marca...", sub: "Redes sociales y perfiles" },
  { text: "Consultando IAs sobre tu sector...", sub: "ChatGPT, Gemini, Perplexity" },
  { text: "Generando tu Trust Score...", sub: "Calculando los 6 pilares" },
];

const WHY_POINTS = [
  { icon: "\u{1F50E}", title: "Tus clientes te buscan antes de comprarte", desc: "El 81% investiga online antes de tomar una decisi\u00F3n. Si no generas confianza en esos primeros segundos, pierdes la venta." },
  { icon: "\u{1F916}", title: "Las IAs ya recomiendan a tu competencia", desc: "ChatGPT, Gemini y Perplexity est\u00E1n reemplazando a Google. Si tu marca no aparece en sus respuestas, no existes para el nuevo comprador." },
  { icon: "\u{1F4C9}", title: "Sin confianza digital, tu CAC se dispara", desc: "Cada euro en ads rinde menos si tu presencia digital no respalda el mensaje. El Trust Score mide exactamente eso." },
];

export default function TrustScoreAnalyzer() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const canUnlock = name.trim() && email.trim() && phone.trim() && consent;

  function isValidDomain(input: string): boolean {
    const cleaned = input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(cleaned);
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!loading) { setStepIndex(0); return; }
    const interval = setInterval(() => {
      setStepIndex(prev => (prev + 1) % STEPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Step 1: Analyze (URL only, no email required)
  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    if (!isValidDomain(url)) {
      setUrlError("Introduce un dominio válido, ej: tuempresa.com");
      return;
    }
    setUrlError("");
    setLoading(true);
    setLogs([]);
    setResult(null);
    setUnlocked(false);
    setLimitReached(false);

    try {
      const resp = await fetch("/.netlify/functions/trust-score-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!resp.ok || !resp.body) {
        setLogs([{ type: "error", message: `Error ${resp.status}: ${resp.statusText}` }]);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const entry: LogEntry = JSON.parse(line.slice(6));
            if (entry.type === "result") {
              setResult(entry.data!);
            } else if (entry.type !== "heartbeat") {
              setLogs(prev => [...prev, entry]);
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err) {
      setLogs(prev => [...prev, { type: "error", message: `Error de conexi\u00F3n: ${err}` }]);
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Unlock with email (after seeing teaser)
  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (!canUnlock || !result) return;
    setUnlockError("");
    setSendingEmail(true);

    // 1. Save lead + check rate limit
    try {
      const leadResp = await fetch("/.netlify/functions/trust-score-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), url: url.trim() }),
      });
      const leadData = await leadResp.json();
      if (leadData.limit_reached) {
        setLimitReached(true);
        setSendingEmail(false);
        return;
      }
    } catch (err) {
      console.warn("Lead capture failed:", err);
    }

    // 2. Send report email via GHL
    let emailSent = false;
    try {
      const emailResp = await fetch("/.netlify/functions/trust-score-send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          result,
          origin: window.location.origin,
        }),
      });
      const emailData = await emailResp.json();
      emailSent = emailData.emailSent === true;
    } catch (err) {
      console.warn("Send report email failed:", err);
    }

    // Track Meta Pixel Lead event
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'Lead', { content_name: 'Trust Score', content_category: 'trust-score' });
    }

    setSendingEmail(false);
    setUnlocked(true);
    if (!emailSent) {
      setUnlockError("El reporte se desbloqueó pero hubo un problema enviando el email. Puedes verlo aquí mismo.");
    }
  }

  // ─── Limit reached ───
  if (limitReached) {
    return (
      <div className="max-w-lg mx-auto px-6 pt-20 text-center">
        <div className="text-5xl mb-6">{"\u{1F512}"}</div>
        <h2 className="text-2xl font-bold text-[#032149] mb-3">
          Has alcanzado el l&iacute;mite de an&aacute;lisis gratuitos
        </h2>
        <p className="text-gray-500 leading-relaxed mb-8">
          Ya has desbloqueado 2 reportes con este email. Si quieres seguir explorando la confianza digital de tu marca,
          agenda una sesi&oacute;n con nosotros y te ayudamos personalmente.
        </p>
        <a
          href="https://api.leadconnectorhq.com/widget/booking/9VRbPAQQnH5AF0jDOPNE"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg px-8 py-3.5 text-sm font-semibold transition-colors shadow-lg shadow-[#6351d5]/25"
        >
          Agendar sesi&oacute;n gratuita con Growth4U
        </a>
        <p className="mt-6 text-xs text-gray-400">
          Sin compromiso. Te mostramos c&oacute;mo mejorar tu Trust Score.
        </p>
      </div>
    );
  }

  // ─── Hero + URL input (before analysis) ───
  if (!loading && !result) {
    return (
      <div>
        {/* Hero */}
        <div className="max-w-2xl mx-auto px-6 pt-12 pb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-[#0faec1]/10 text-[#0faec1] text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-[#0faec1] rounded-full animate-pulse" />
            Gratis — resultado en menos de 2 minutos
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#032149] leading-tight tracking-tight">
            &iquest;Tu marca genera<br />
            <span className="text-[#0faec1]">confianza digital</span>?
          </h1>
          <p className="mt-5 text-lg text-gray-500 leading-relaxed max-w-lg mx-auto">
            Descubre c&oacute;mo te perciben Google, las IAs y tus potenciales clientes.
          </p>
        </div>

        {/* URL input only */}
        <div className="max-w-lg mx-auto px-6 pb-12">
          <form onSubmit={handleAnalyze} className="bg-white border border-gray-200 rounded-2xl shadow-lg shadow-gray-200/50 p-6">
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">URL de tu empresa</label>
            <div className="flex gap-3">
              <input
                id="url"
                type="text"
                value={url}
                onChange={e => { setUrl(e.target.value); setUrlError(""); }}
                placeholder="growth4u.io"
                autoFocus
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-base font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0faec1] focus:border-transparent placeholder:text-gray-400"
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-6 py-3 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                Analizar
              </button>
            </div>
            {urlError && <p className="text-xs text-red-500 mt-3 text-center">{urlError}</p>}
            {!urlError && <p className="text-xs text-gray-400 mt-3 text-center">Sin registro. Resultado inmediato.</p>}
          </form>
        </div>

        {/* Why Trust Score matters */}
        <div className="max-w-3xl mx-auto px-6 pb-12">
          <h2 className="text-center text-xl font-bold text-[#032149] mb-8">&iquest;Por qu&eacute; necesitas conocer tu Trust Score?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {WHY_POINTS.map((point, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl mb-3">{point.icon}</div>
                <h3 className="text-sm font-semibold text-[#032149] mb-2">{point.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* What we analyze */}
        <div className="max-w-3xl mx-auto px-6 pb-16">
          <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">Analizamos 6 pilares de confianza</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(PILLAR_LABELS).map(([key, label]) => (
              <div key={key} className="bg-white border border-gray-100 rounded-xl p-4 text-center hover:border-[#0faec1]/30 hover:shadow-sm transition-all">
                <div className="text-2xl mb-2">{PILLAR_ICONS[key]}</div>
                <div className="text-sm font-semibold text-[#032149]">{label}</div>
                <div className="text-xs text-gray-400 mt-1">{PILLAR_DESCRIPTIONS[key]}</div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-xs text-gray-400">
            <span>IA avanzada</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full" />
            <span>6 pilares</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full" />
            <span>100% gratuito</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading view ───
  if (loading && !result) {
    const progress = Math.min(95, (elapsed / 120) * 100);
    return (
      <div className="max-w-lg mx-auto px-6 pt-20 text-center">
        <div className="mx-auto w-16 h-16 mb-8 relative">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
          <div className="absolute inset-0 rounded-full border-4 border-[#0faec1] border-t-transparent animate-spin" />
        </div>

        <h2 className="text-2xl font-bold text-[#032149] mb-2">
          {STEPS[stepIndex].text}
        </h2>
        <p className="text-sm text-gray-400 mb-8">{STEPS[stepIndex].sub}</p>

        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-[#0faec1] rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">
          {elapsed < 60
            ? `${elapsed}s — suele tardar entre 1 y 2 minutos`
            : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s — casi listo...`
          }
        </p>

        {logs.length > 0 && (
          <details className="mt-8 text-left">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors">
              Ver detalle t&eacute;cnico ({logs.length} eventos)
            </summary>
            <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 max-h-60 overflow-y-auto">
              <div className="space-y-0.5 font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className={log.type === "step" ? "text-[#032149] mt-2 font-semibold" : "text-gray-400"}>
                    {log.type === "step" && `\u25B8 ${log.message}`}
                    {log.type === "detail" && log.message}
                    {log.type === "error" && <span className="text-red-500">{log.message}</span>}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </details>
        )}
      </div>
    );
  }

  // ─── Results view: opportunity message + contact form (no scores shown) ───
  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      {/* New analysis button */}
      <div className="flex justify-end mb-6">
        <button
          onClick={() => { setResult(null); setLogs([]); setUnlocked(false); setUrl(""); }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          Nuevo an&aacute;lisis
        </button>
      </div>

      {result && !unlocked && (
        <>
          {/* Trust Score summary — visible before gating */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-[#032149] mb-6">
              Resultados para <span className="text-[#0faec1]">{result.company_name}</span>
            </h2>

            {/* Score circle */}
            <div className="inline-flex items-center justify-center w-28 h-28 rounded-full border-4 mb-4"
              style={{ borderColor: result.trust_score >= 70 ? '#0faec1' : result.trust_score >= 40 ? '#d97706' : '#dc2626' }}>
              <div>
                <div className="text-4xl font-bold font-mono" style={{ color: result.trust_score >= 70 ? '#0faec1' : result.trust_score >= 40 ? '#d97706' : '#dc2626' }}>
                  {result.trust_score}
                </div>
                <div className="text-xs text-gray-400">/100</div>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">Trust Score</p>
            <p className="text-xs text-gray-400 mb-8">{result.one_liner}</p>

            {/* Pillar bars */}
            <div className="space-y-3 text-left mb-8">
              {Object.entries(result.pillars).map(([key, pillar]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#032149]">
                      {PILLAR_ICONS[key]} {PILLAR_LABELS[key] || key}
                    </span>
                    <span className="text-sm font-bold font-mono" style={{ color: pillar.score >= 70 ? '#0faec1' : pillar.score >= 40 ? '#d97706' : '#dc2626' }}>
                      {pillar.score}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pillar.score}%`,
                        backgroundColor: pillar.score >= 70 ? '#0faec1' : pillar.score >= 40 ? '#d97706' : '#dc2626',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Top gaps teaser */}
            {result.top_gaps && result.top_gaps.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-left mb-8">
                <h3 className="text-sm font-semibold text-amber-800 mb-3">Principales oportunidades de mejora</h3>
                <ul className="space-y-2">
                  {result.top_gaps.slice(0, 3).map((gap, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                      <span className="mt-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0" />
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Gate: detailed report */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
            <div className="text-center mb-5">
              <h3 className="text-lg font-bold text-[#032149] mb-2">Recibe el reporte detallado</h3>
              <p className="text-sm text-gray-500">
                Con hallazgos por pilar, comparaci&oacute;n con competidores y recomendaciones personalizadas.
              </p>
            </div>
            <form onSubmit={handleUnlock} className="space-y-4">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Tu nombre"
                disabled={sendingEmail}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0faec1] focus:border-transparent placeholder:text-gray-400 disabled:opacity-50"
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                disabled={sendingEmail}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0faec1] focus:border-transparent placeholder:text-gray-400 disabled:opacity-50"
              />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+34 600 000 000"
                disabled={sendingEmail}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0faec1] focus:border-transparent placeholder:text-gray-400 disabled:opacity-50"
              />
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  disabled={sendingEmail}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0faec1] focus:ring-[#0faec1]"
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  Acepto que Growth4U procese mis datos para enviarme el reporte.{" "}
                  <a href="https://growth4u.io/privacidad" target="_blank" rel="noopener noreferrer" className="text-[#0faec1] hover:underline">
                    Pol&iacute;tica de privacidad
                  </a>
                </span>
              </label>
              {unlockError && <p className="text-xs text-red-500">{unlockError}</p>}
              <button
                type="submit"
                disabled={!canUnlock || sendingEmail}
                className="w-full bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-3.5 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {sendingEmail ? "Enviando reporte..." : "Recibir reporte detallado gratis"}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ─── EMAIL SENT confirmation ─── */}
      {result && unlocked && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#0faec1]/10 rounded-full mb-6">
            <span className="text-3xl">{"\u{1F4EC}"}</span>
          </div>
          <h2 className="text-2xl font-bold text-[#032149] mb-3">
            &iexcl;Tu reporte est&aacute; en camino!
          </h2>
          <p className="text-gray-600 leading-relaxed mb-2 max-w-md mx-auto font-medium">
            Hemos encontrado oportunidades muy buenas para mejorar el nivel de confianza digital de {result.company_name}.
          </p>
          <p className="text-gray-500 text-sm mb-2">
            El an&aacute;lisis completo ha sido enviado a:
          </p>
          <p className="text-[#0faec1] font-semibold mb-6">{email}</p>
          <p className="text-sm text-gray-400 mb-10">
            Revisa tu bandeja de entrada (y spam, por si acaso). El reporte incluye
            hallazgos detallados, gaps cr&iacute;ticos y recomendaciones.
          </p>

          <div className="border-t border-gray-100 pt-8">
            <p className="text-sm text-gray-500 mb-4">
              &iquest;Quieres que te ayudemos a mejorar tu Trust Score?
            </p>
            <a
              href="https://api.leadconnectorhq.com/widget/booking/9VRbPAQQnH5AF0jDOPNE"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg px-8 py-3.5 text-sm font-semibold transition-colors shadow-lg shadow-[#6351d5]/25"
            >
              Agendar sesi&oacute;n estrat&eacute;gica gratuita
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

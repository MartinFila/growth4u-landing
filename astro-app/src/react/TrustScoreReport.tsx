import { useState, useEffect } from "react";
import { inflate } from "pako";

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

function scoreColor(score: number): string {
  if (score >= 70) return "#0faec1";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function ScoreCircle({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative w-28 h-28">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold font-mono" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-400">/100</span>
      </div>
    </div>
  );
}

function PillarCard({ name, icon, description, pillar }: { name: string; icon: string; description: string; pillar: Pillar }) {
  const color = scoreColor(pillar.score);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-semibold text-[#032149] text-sm">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pillar.score}%`, backgroundColor: color }} />
          </div>
          <span className="text-sm font-bold font-mono" style={{ color }}>{pillar.score}</span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3">{description}</p>
      {pillar.findings && pillar.findings.length > 0 && (
        <ul className="space-y-2">
          {pillar.findings.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TrustScoreReport() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const d = params.get("d");
      if (!d) {
        setError("No se encontraron datos del reporte.");
        return;
      }
      // Decode base64url → inflate → JSON
      const binary = Uint8Array.from(atob(d.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const decompressed = inflate(binary, { to: "string" });
      const parsed = JSON.parse(decompressed);
      setResult(parsed);
    } catch {
      setError("No se pudo cargar el reporte. El enlace puede haber expirado.");
    }
  }, []);

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="text-4xl mb-4">{"\u26A0\uFE0F"}</div>
        <h2 className="text-xl font-bold text-[#032149] mb-3">{error}</h2>
        <a href="/recursos/trust-score/" className="text-[#6351d5] hover:underline text-sm">
          Realizar un nuevo an&aacute;lisis
        </a>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-20 text-center text-gray-400">
        <div className="inline-flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando reporte...
        </div>
      </div>
    );
  }

  const pillarOrder = ["borrowed_trust", "serp_trust", "brand_assets", "geo_presence", "outbound_readiness", "demand_engine"];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <a href="https://growth4u.io" className="flex items-center gap-2">
          <img src="https://i.imgur.com/imHxGWI.png" alt="Growth4U" className="h-7" />
        </a>
        <span className="text-xs text-gray-400 font-medium">Trust Score Report</span>
      </div>

      {/* Score summary */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 mt-6">
        <div className="flex items-center gap-6">
          <ScoreCircle score={result.trust_score} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[#032149] mb-1">{result.company_name}</h1>
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{result.one_liner}</p>
            {result.business_type && (
              <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded font-medium">
                {result.business_type}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pillar cards */}
      <div className="space-y-4 mb-8">
        {pillarOrder.map(key => {
          const pillar = result.pillars[key];
          if (!pillar) return null;
          return (
            <PillarCard
              key={key}
              name={PILLAR_LABELS[key] || key}
              icon={PILLAR_ICONS[key] || ""}
              description={PILLAR_DESCRIPTIONS[key] || ""}
              pillar={pillar}
            />
          );
        })}
      </div>

      {/* SERP Highlight */}
      {result.serp_highlight && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
            <span>{"\u{1F50D}"}</span> SERP Highlight
          </h3>
          <p className="text-sm text-blue-700 leading-relaxed">{result.serp_highlight}</p>
        </div>
      )}

      {/* GEO Highlight */}
      {result.geo_highlight && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
            <span>{"\u{1F916}"}</span> GEO Highlight
          </h3>
          <p className="text-sm text-purple-700 leading-relaxed">{result.geo_highlight}</p>
        </div>
      )}

      {/* Competitor Comparison */}
      {result.competitor_comparison && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
            <span>{"\u2694\uFE0F"}</span> vs {result.competitor_comparison.competitor_name}
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-orange-800">Ellos: </span>
              <span className="text-orange-700">{result.competitor_comparison.competitor_advantage}</span>
            </div>
            <div>
              <span className="font-medium text-orange-800">T&uacute;: </span>
              <span className="text-orange-700">{result.competitor_comparison.brand_advantage}</span>
            </div>
            <div className="bg-orange-100/60 rounded-lg p-3 text-orange-800 text-xs italic leading-relaxed">
              {result.competitor_comparison.key_gap}
            </div>
          </div>
        </div>
      )}

      {/* Missing Sources */}
      {result.missing_sources && result.missing_sources.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>{"\u{1F4CB}"}</span> FUENTES DONDE DEBER&Iacute;AS ESTAR
          </h3>
          <ol className="space-y-2">
            {result.missing_sources.map((source, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-gray-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                {source}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Top Gaps */}
      {result.top_gaps && result.top_gaps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
            <span>{"\u{1F6A8}"}</span> Top Gaps
          </h3>
          <ol className="space-y-2">
            {result.top_gaps.map((gap, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="text-red-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                {gap}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Verdict */}
      {result.verdict && (
        <div className="bg-[#032149] rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-white/70 mb-2 flex items-center gap-2 uppercase tracking-wider">
            <span>{"\u{1F3AF}"}</span> Veredicto
          </h3>
          <p className="text-sm text-white/90 leading-relaxed">{result.verdict}</p>
        </div>
      )}

      {/* Share + CTA */}
      <div className="text-center space-y-6 py-4">
        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: `Trust Score — ${result.company_name}`, url: window.location.href });
            } else {
              navigator.clipboard.writeText(window.location.href);
              alert("Enlace copiado al portapapeles");
            }
          }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-2 mx-auto"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
          </svg>
          Compartir reporte
        </button>

        <div>
          <p className="text-sm text-gray-500 mb-4">
            &iquest;Quieres que te ayudemos a mejorar tu Trust Score?
          </p>
          <a
            href="https://api.leadconnectorhq.com/widget/booking/9VRbPAQQnH5AF0jDOPNE"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-full px-8 py-3.5 text-sm font-semibold transition-colors shadow-lg shadow-[#6351d5]/25"
          >
            Agendar sesi&oacute;n estrat&eacute;gica gratuita
          </a>
        </div>

        <p className="text-xs text-gray-300 pt-4">
          Powered by <a href="https://growth4u.io" className="text-[#0faec1] hover:underline">Growth4U</a> Trust Engine
        </p>
      </div>
    </div>
  );
}

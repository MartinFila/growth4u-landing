import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  X,
  ImageIcon,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { getAllPosts } from '../../../lib/firebase-client';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  image: string;
  createdAt: string | null;
}

interface QueueItem {
  post: BlogPost;
  caption: string;
  liImageUrl: string;
  status: 'generating' | 'draft' | 'publishing' | 'published' | 'error';
  error?: string;
}

const FUNCTION_URL = '/.netlify/functions/linkedin';
const LINKEDIN_CLIENT_ID = '78u22bpyd8o0f0';
const CLOUDINARY_CLOUD = 'dsc0jsbkz';
const CLOUDINARY_PRESET = 'blog_uploads';

// LinkedIn template on Cloudinary (1728x2304) — text area is the cyan-bordered rectangle
const LI_TEMPLATE = {
  url: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/v1772726703/li-template-0.jpg',
  textX: 88,
  textY: 1000,
  textW: 1552,
  textH: 550,
};

// --- Canvas image generator ---

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function generateLIImage(text: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1728;
  canvas.height = 2304;
  const ctx = canvas.getContext('2d')!;

  // Draw template
  const templateImg = await loadImage(LI_TEMPLATE.url);
  ctx.drawImage(templateImg, 0, 0, 1728, 2304);

  // Text area
  const { textX, textY, textW, textH } = LI_TEMPLATE;
  const padding = 20;
  const innerW = textW - padding * 2;
  const innerH = textH - padding * 2;

  // Determine font size (try from large to small) — start big to fill the box
  const upperText = text.toUpperCase();
  let fontSize = 120;
  let lines: string[] = [];

  ctx.font = `900 ${fontSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;

  for (fontSize = 120; fontSize >= 36; fontSize -= 2) {
    ctx.font = `900 ${fontSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;
    lines = wrapText(ctx, upperText, innerW);
    const lineHeight = fontSize * 1.2;
    const totalH = lines.length * lineHeight;
    if (totalH <= innerH) break;
  }

  // Draw text centered in the box
  const lineHeight = fontSize * 1.2;
  const totalTextH = lines.length * lineHeight;
  const startY = textY + padding + (innerH - totalTextH) / 2 + fontSize;

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX + textW / 2, startY + i * lineHeight);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92);
  });
}

async function uploadToCloudinary(blob: Blob, slug: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', CLOUDINARY_PRESET);
  form.append('public_id', `li-post-${slug}-${Date.now()}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!data.secure_url) throw new Error('Cloudinary upload failed');
  return data.secure_url;
}

// --- Caption generator (based on LinkedIn Post Skill for Philippe Sainthubert) ---

const PAIN_LEAD_MAGNETS: Record<string, { name: string; url: string }> = {
  cac: { name: 'Framework CAC Sostenible', url: 'growth4u.io/recursos/cac-sostenible/' },
  confianza: { name: 'Framework Nichos 60 Días', url: 'growth4u.io/recursos/framework-nichos-60-dias/' },
  estancamiento: { name: 'Diagnóstico Meseta de Crecimiento', url: 'growth4u.io/recursos/meseta-de-crecimiento/' },
  sistema: { name: 'Sistema de Growth (blueprint)', url: 'growth4u.io/recursos/sistema-de-growth/' },
  competencia: { name: 'Playbook David vs Goliat', url: 'growth4u.io/recursos/david-vs-goliat/' },
  fundador: { name: 'Kit de Liberación del Fundador', url: 'growth4u.io/recursos/kit-de-liberacion/' },
  attribution: { name: 'Dashboard de Attribution', url: 'growth4u.io/recursos/dashboard-de-attribution/' },
};

function detectPain(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('cac') || lower.includes('coste de adquisición') || lower.includes('adquisición')) return 'cac';
  if (lower.includes('confianza') || lower.includes('regulación') || lower.includes('desconfianza')) return 'confianza';
  if (lower.includes('estanca') || lower.includes('meseta') || lower.includes('tracción')) return 'estancamiento';
  if (lower.includes('sistema') || lower.includes('growth') || lower.includes('framework')) return 'sistema';
  if (lower.includes('competencia') || lower.includes('gigante') || lower.includes('david')) return 'competencia';
  if (lower.includes('fundador') || lower.includes('cuello de botella') || lower.includes('liberación')) return 'fundador';
  if (lower.includes('attribution') || lower.includes('atribución') || lower.includes('medición')) return 'attribution';
  return null;
}

function generateCaption(post: BlogPost): string {
  const pain = detectPain(`${post.title} ${post.excerpt}`);
  const leadMagnet = pain ? PAIN_LEAD_MAGNETS[pain] : null;

  const lines: string[] = [];

  // Hook — always use title (excerpt can be truncated from Firebase)
  lines.push(post.title);
  lines.push('');

  // Blog link
  lines.push('Lee el artículo completo:');
  lines.push(`growth4u.io/blog/${post.slug}/`);

  // CTA mapped to pain if detected
  if (leadMagnet) {
    lines.push('');
    lines.push(`Descargá gratis el ${leadMagnet.name}:`);
    lines.push(leadMagnet.url);
  }

  lines.push('');
  lines.push('#GrowthMarketing #Growth4U #B2B');

  return lines.join('\n');
}

// --- Main component ---

export default function LinkedInPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [publishedSlugs] = useState<Set<string>>(new Set());
  const [linkedinStatus, setLinkedinStatus] = useState<{ connected: boolean; org?: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadPosts();
    checkLinkedInConnection();
  }, []);

  async function checkLinkedInConnection() {
    try {
      const res = await fetch(FUNCTION_URL);
      const data = await res.json();
      setLinkedinStatus(data);
    } catch {
      setLinkedinStatus({ connected: false });
    }
  }

  function connectLinkedIn() {
    const redirectUri = `${window.location.origin}/.netlify/functions/linkedin-callback`;
    const scope = 'openid profile w_member_social r_organization_social';
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    window.open(url, '_blank');
  }

  async function loadPosts() {
    setLoading(true);
    try {
      const allPosts = await getAllPosts();
      setPosts(allPosts as BlogPost[]);
    } catch {
      console.error('Error loading posts');
    }
    setLoading(false);
  }

  async function addToQueue(post: BlogPost) {
    const caption = generateCaption(post);
    const newItem: QueueItem = {
      post,
      caption,
      liImageUrl: '',
      status: 'generating',
    };

    setQueue((prev) => [...prev, newItem]);
    const idx = queue.length;

    try {
      const blob = await generateLIImage(post.title);
      const url = await uploadToCloudinary(blob, post.slug);
      setQueue((prev) => {
        const updated = [...prev];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], liImageUrl: url, status: 'draft' };
        }
        return updated;
      });
    } catch (err) {
      setQueue((prev) => {
        const updated = [...prev];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], status: 'error', error: String(err) };
        }
        return updated;
      });
    }
  }

  function removeFromQueue(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, updates: Partial<QueueItem>) {
    setQueue((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  }

  async function publishNow(index: number) {
    const item = queue[index];
    updateItem(index, { status: 'publishing', error: undefined });

    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: item.caption,
          imageUrl: item.liImageUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al publicar');

      updateItem(index, { status: 'published' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      updateItem(index, { status: 'error', error: msg });
    }
  }

  async function publishAll() {
    const drafts = queue
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.status === 'draft');

    for (const { i } of drafts) {
      await publishNow(i);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const availablePosts = posts.filter((p) => !publishedSlugs.has(p.slug));
  const draftCount = queue.filter((i) => i.status === 'draft').length;

  return (
    <div>
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#032149]">LinkedIn — Growth4U</h1>
          <p className="text-slate-500 mt-1">Genera y publica posts de LinkedIn desde tus blogs</p>
          {linkedinStatus && (
            <div className="mt-2">
              {linkedinStatus.connected ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Conectado: {linkedinStatus.org}
                </span>
              ) : (
                <button
                  onClick={connectLinkedIn}
                  className="inline-flex items-center gap-1.5 text-xs text-white bg-[#0077B5] px-3 py-1.5 rounded-full hover:bg-[#005f8d] transition-colors"
                >
                  Conectar LinkedIn
                </button>
              )}
            </div>
          )}
        </div>
        {draftCount > 0 && (
          <button
            onClick={publishAll}
            className="flex items-center gap-2 px-4 py-2 bg-[#0077B5] text-white rounded-lg hover:bg-[#005f8d] transition-colors"
          >
            <Send className="w-4 h-4" />
            Publicar todos ({draftCount})
          </button>
        )}
      </div>

      {/* Queue — always on top */}
      {queue.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-[#032149] mb-4">
            Cola de publicación ({queue.length})
          </h2>
          <div className="space-y-4">
            {queue.map((item, index) => (
              <div
                key={`${item.post.slug}-${index}`}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start gap-4">
                  {/* Preview */}
                  <div className="relative w-32 flex-shrink-0">
                    {item.status === 'generating' ? (
                      <div className="w-32 h-40 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-[#0077B5] animate-spin" />
                      </div>
                    ) : item.liImageUrl ? (
                      <div className="relative group">
                        <img
                          src={item.liImageUrl}
                          alt=""
                          className="w-32 h-40 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => setPreviewUrl(item.liImageUrl)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity"
                        >
                          <Eye className="w-6 h-6 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-32 h-40 bg-red-50 rounded-lg flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-400" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-[#032149] text-sm">{item.post.title}</h3>
                      <div className="flex items-center gap-2">
                        {/* Status badge */}
                        {item.status === 'generating' && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                            <Sparkles className="w-3 h-3" /> Generando...
                          </span>
                        )}
                        {item.status === 'draft' && (
                          <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Listo
                          </span>
                        )}
                        {item.status === 'publishing' && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" /> Publicando...
                          </span>
                        )}
                        {item.status === 'published' && (
                          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Publicado
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Error
                          </span>
                        )}
                        <button
                          onClick={() => removeFromQueue(index)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Caption */}
                    <textarea
                      value={item.caption}
                      onChange={(e) => updateItem(index, { caption: e.target.value })}
                      className="w-full text-sm border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#0077B5]"
                      rows={3}
                    />

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-2">
                      {item.status === 'draft' && (
                        <button
                          onClick={() => publishNow(index)}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-[#0077B5] text-white rounded-lg hover:bg-[#005f8d] transition-colors"
                        >
                          <Send className="w-3 h-3" /> Publicar en LinkedIn
                        </button>
                      )}

                      {item.status === 'error' && (
                        <button
                          onClick={() => updateItem(index, { status: 'draft', error: undefined })}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" /> Reintentar
                        </button>
                      )}
                    </div>

                    {item.error && (
                      <p className="text-xs text-red-500 mt-1">{item.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blog posts grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-[#032149] mb-4">Seleccionar blog posts</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#0077B5] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availablePosts.map((post) => {
              const inQueue = queue.some((q) => q.post.slug === post.slug);
              return (
                <div
                  key={post.id}
                  className={`bg-white rounded-xl border p-4 transition-all ${
                    inQueue
                      ? 'border-[#0077B5] bg-blue-50 opacity-60'
                      : 'border-slate-200 hover:border-[#0077B5] hover:shadow-md cursor-pointer'
                  }`}
                  onClick={() => !inQueue && addToQueue(post)}
                >
                  <div className="flex items-start gap-3">
                    {post.image ? (
                      <img src={post.image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-[#032149] line-clamp-2">{post.title}</h3>
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {post.category}
                      </span>
                    </div>
                    {inQueue && <CheckCircle2 className="w-5 h-5 text-[#0077B5] flex-shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty state */}
      {queue.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Selecciona blog posts para generar contenido de LinkedIn</p>
        </div>
      )}

      {/* Full-size preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-lg w-full">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={previewUrl} alt="Preview" className="w-full rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

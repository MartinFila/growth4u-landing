import { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Loader2,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  X,
  Calendar,
  ImageIcon,
  BarChart3,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Users,
  TrendingUp,
  RefreshCw,
  ExternalLink,
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

interface ScheduleItem {
  post: BlogPost;
  caption: string;
  igImageUrl: string; // Cloudinary URL of generated IG image
  scheduledDate: string;
  scheduledTime: string;
  status: 'generating' | 'draft' | 'publishing' | 'scheduled' | 'published' | 'error';
  error?: string;
  mediaId?: string;
}

const FUNCTION_URL = '/.netlify/functions/instagram';
const CLOUDINARY_CLOUD = 'dsc0jsbkz';
const CLOUDINARY_PRESET = 'blog_uploads';

// Avatar templates on Cloudinary (5 variants) with text area coordinates (at 1728x2304)
const AVATAR_TEMPLATES = [
  { url: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/v1772721430/ig-avatar-0.jpg', textX: 840, textY: 191, textW: 724, textH: 836 },
  { url: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/v1772721433/ig-avatar-1.jpg', textX: 172, textY: 196, textW: 754, textH: 858 },
  { url: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/v1772721450/ig-avatar-2.jpg', textX: 848, textY: 192, textW: 712, textH: 850 },
  { url: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/v1772721454/ig-avatar-3.jpg', textX: 164, textY: 175, textW: 772, textH: 872 },
  { url: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/v1772721458/ig-avatar-4.jpg', textX: 168, textY: 199, textW: 756, textH: 858 },
];

// --- Canvas image generator (1080x1350 vertical with avatar) ---

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

async function generateIGImage(title: string, _category: string, templateIndex: number): Promise<Blob> {
  // Work at original template resolution (1728x2304) for quality
  const W = 1728;
  const H = 2304;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Load avatar template with its text area coordinates
  const template = AVATAR_TEMPLATES[templateIndex % AVATAR_TEMPLATES.length];
  const templateImg = await loadImage(template.url);

  // Draw template at full resolution
  ctx.drawImage(templateImg, 0, 0, W, H);

  // Write title text inside the empty speech bubble
  const { textX, textY, textW, textH } = template;
  const padding = 60;
  const maxTextWidth = textW - padding * 2;

  // Comic-style bold font — sized to fit bubble, uppercase for punch
  const titleUpper = title.toUpperCase();
  const fontSize = titleUpper.length > 100 ? 42 : titleUpper.length > 70 ? 48 : titleUpper.length > 40 ? 56 : 64;
  ctx.font = `900 ${fontSize}px "Comic Sans MS", "Comic Neue", Impact, system-ui, sans-serif`;
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';

  const lines = wrapText(ctx, titleUpper, maxTextWidth);
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const textCenterX = textX + textW / 2;
  const textStartY = textY + (textH - totalTextHeight) / 2 + fontSize * 0.35;

  // Draw each line with slight letter spacing for comic feel
  lines.forEach((line, i) => {
    const y = textStartY + i * lineHeight;
    // Draw text with tracking (letter-spacing) by drawing char by char
    const spacing = 2;
    const totalWidth = ctx.measureText(line).width + (line.length - 1) * spacing;
    let x = textCenterX - totalWidth / 2;
    for (const char of line) {
      ctx.fillText(char, x + ctx.measureText(char).width / 2, y);
      x += ctx.measureText(char).width + spacing;
    }
  });

  // Scale down to 1080x1350 for Instagram
  const outCanvas = document.createElement('canvas');
  outCanvas.width = 1080;
  outCanvas.height = 1350;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.drawImage(canvas, 0, 0, 1080, 1350);

  return new Promise((resolve) => {
    outCanvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92);
  });
}

async function uploadToCloudinary(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', CLOUDINARY_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: 'POST', body: form }
  );
  const data = await res.json();
  return data.secure_url;
}

// --- Metrics types ---

interface IGAccount {
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
}

interface IGMedia {
  id: string;
  caption: string;
  like_count: number;
  comments_count: number;
  timestamp: string;
  media_url: string;
  permalink: string;
  media_type: string;
  impressions: number;
  reach: number;
  saved: number;
  shares: number;
}

// --- Component ---

export default function CameraPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [previewItem, setPreviewItem] = useState<ScheduleItem | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<'publish' | 'metrics'>('publish');
  const [metrics, setMetrics] = useState<{ account: IGAccount; media: IGMedia[] } | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState('');

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    try {
      const allPosts = await getAllPosts();
      setPosts(allPosts as BlogPost[]);
    } catch (e) {
      console.error('Error loading posts:', e);
    }
    setLoading(false);
  }

  async function loadMetrics() {
    setMetricsLoading(true);
    setMetricsError('');
    try {
      const res = await fetch(FUNCTION_URL);
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Función no disponible (${res.status})`);
      }
      if (!res.ok) {
        throw new Error((data.error as string) || `Error ${res.status}`);
      }
      setMetrics(data as unknown as { account: IGAccount; media: IGMedia[] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error cargando métricas';
      setMetricsError(msg);
    }
    setMetricsLoading(false);
  }

  function togglePost(id: string) {
    setSelectedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const filtered = filteredPosts();
    if (selectedPosts.size === filtered.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(filtered.map((p) => p.id)));
    }
  }

  function filteredPosts() {
    if (filter === 'all') return posts;
    return posts.filter((p) => p.category === filter);
  }

  function generateCaption(post: BlogPost): string {
    const hashtags = [
      '#GrowthMarketing',
      '#Fintech',
      '#Growth4U',
      '#MarketingDigital',
      '#B2B',
    ];

    const categoryTags: Record<string, string[]> = {
      Growth: ['#GrowthHacking', '#Startup'],
      Marketing: ['#ContentMarketing', '#SEO'],
      GEO: ['#GEO', '#ChatGPT', '#IA'],
      Estrategia: ['#EstrategiaDigital', '#GTM'],
      Producto: ['#ProductLedGrowth', '#SaaS'],
    };

    const extraTags = categoryTags[post.category] || [];
    const allTags = [...hashtags, ...extraTags].slice(0, 8);

    return `${post.title}\n\n${post.excerpt}\n\n👉 Lee el artículo completo en growth4u.io/blog/${post.slug}/\n\n${allTags.join(' ')}`;
  }

  async function generateCaptions() {
    setGeneratingCaptions(true);

    const selected = posts.filter((p) => selectedPosts.has(p.id));

    // Generate default date schedule: one post per day starting tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Create items with 'generating' status first
    const items: ScheduleItem[] = selected.map((post, i) => {
      const date = new Date(tomorrow);
      date.setDate(date.getDate() + i);

      return {
        post,
        caption: generateCaption(post),
        igImageUrl: '',
        scheduledDate: date.toISOString().split('T')[0],
        scheduledTime: '10:00',
        status: 'generating',
      };
    });

    setScheduleItems(items);
    setSelectedPosts(new Set());

    // Generate and upload images for each item
    for (let i = 0; i < items.length; i++) {
      try {
        const blob = await generateIGImage(items[i].post.title, items[i].post.category, i);
        const url = await uploadToCloudinary(blob);
        setScheduleItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, igImageUrl: url, status: 'draft' } : it
          )
        );
      } catch (err) {
        console.error('Error generating IG image:', err);
        setScheduleItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? { ...it, status: 'error', error: 'Error generando imagen' }
              : it
          )
        );
      }
    }

    setGeneratingCaptions(false);
  }

  function updateCaption(index: number, caption: string) {
    setScheduleItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, caption } : item))
    );
  }



  function removeItem(index: number) {
    setScheduleItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function publishItem(index: number, immediate: boolean) {
    setScheduleItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, status: 'publishing' } : item
      )
    );

    const item = scheduleItems[index];

    try {
      const body: Record<string, unknown> = {
        action: immediate ? 'publish' : 'schedule',
        image_url: item.igImageUrl,
        caption: item.caption,
      };

      if (!immediate) {
        const dateTime = new Date(
          `${item.scheduledDate}T${item.scheduledTime}:00`
        );
        body.scheduled_publish_time = Math.floor(dateTime.getTime() / 1000);
      }

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Función no disponible (${res.status}). ¿Está desplegada?`);
      }

      if (!res.ok) {
        throw new Error((data.error as string) || `Error ${res.status}: ${text.slice(0, 200)}`);
      }

      setScheduleItems((prev) =>
        prev.map((it, i) =>
          i === index
            ? {
                ...it,
                status: immediate ? 'published' as const : 'scheduled' as const,
                mediaId: String(data.media_id || data.container_id || ''),
              }
            : it
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setScheduleItems((prev) =>
        prev.map((it, i) =>
          i === index ? { ...it, status: 'error', error: message } : it
        )
      );
    }
  }

  async function publishAll() {
    for (let i = 0; i < scheduleItems.length; i++) {
      if (scheduleItems[i].status === 'draft') {
        await publishItem(i, true);
        // Wait between calls to respect rate limits
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  const categories = [...new Set(posts.map((p) => p.category))];
  const filtered = filteredPosts();
  const draftCount = scheduleItems.filter((i) => i.status === 'draft').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#6351d5] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#032149] flex items-center gap-3">
            <Camera className="w-7 h-7 text-pink-500" />
            Instagram
          </h1>
          <p className="text-slate-500 mt-1">
            Publica y programa posts desde tu contenido del blog
          </p>
        </div>
        {activeTab === 'publish' && scheduleItems.length > 0 && draftCount > 0 && (
          <button
            onClick={publishAll}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            <Send className="w-4 h-4" />
            Publicar todos ({draftCount})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('publish')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'publish'
              ? 'bg-white text-[#032149] shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Send className="w-4 h-4" />
          Publicar
        </button>
        <button
          onClick={() => { setActiveTab('metrics'); if (!metrics && !metricsLoading) loadMetrics(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'metrics'
              ? 'bg-white text-[#032149] shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas
        </button>
      </div>

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div>
          {metricsLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#6351d5] animate-spin" />
            </div>
          )}

          {metricsError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
              {metricsError}
            </div>
          )}

          {metrics && !metricsLoading && (
            <>
              {/* Account overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Seguidores
                  </div>
                  <p className="text-2xl font-bold text-[#032149]">
                    {metrics.account.followers_count.toLocaleString()}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Siguiendo
                  </div>
                  <p className="text-2xl font-bold text-[#032149]">
                    {metrics.account.follows_count.toLocaleString()}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Publicaciones
                  </div>
                  <p className="text-2xl font-bold text-[#032149]">
                    {metrics.account.media_count.toLocaleString()}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Engagement rate
                  </div>
                  <p className="text-2xl font-bold text-[#032149]">
                    {metrics.media.length > 0
                      ? (
                          (metrics.media.reduce((sum, m) => sum + m.like_count + m.comments_count, 0) /
                            metrics.media.length /
                            Math.max(metrics.account.followers_count, 1)) *
                          100
                        ).toFixed(2) + '%'
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Refresh button */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#032149]">
                  Últimas publicaciones
                </h2>
                <button
                  onClick={loadMetrics}
                  disabled={metricsLoading}
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#6351d5] transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${metricsLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
              </div>

              {/* Media table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-3 font-medium text-slate-500">Post</th>
                        <th className="text-center p-3 font-medium text-slate-500">
                          <Heart className="w-4 h-4 mx-auto" />
                        </th>
                        <th className="text-center p-3 font-medium text-slate-500">
                          <MessageCircle className="w-4 h-4 mx-auto" />
                        </th>
                        <th className="text-center p-3 font-medium text-slate-500">
                          <Bookmark className="w-4 h-4 mx-auto" />
                        </th>
                        <th className="text-center p-3 font-medium text-slate-500">
                          <Share2 className="w-4 h-4 mx-auto" />
                        </th>
                        <th className="text-center p-3 font-medium text-slate-500">
                          <Eye className="w-4 h-4 mx-auto" />
                        </th>
                        <th className="text-center p-3 font-medium text-slate-500">Alcance</th>
                        <th className="text-center p-3 font-medium text-slate-500"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.media.map((m) => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {m.media_url && (
                                <img
                                  src={m.media_url}
                                  alt=""
                                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs text-[#032149] line-clamp-2 leading-tight">
                                  {m.caption?.split('\n')[0]?.slice(0, 80) || '—'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(m.timestamp).toLocaleDateString('es-ES')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="text-center p-3 text-slate-700 font-medium">{m.like_count}</td>
                          <td className="text-center p-3 text-slate-700 font-medium">{m.comments_count}</td>
                          <td className="text-center p-3 text-slate-700 font-medium">{m.saved}</td>
                          <td className="text-center p-3 text-slate-700 font-medium">{m.shares}</td>
                          <td className="text-center p-3 text-slate-700 font-medium">{m.impressions.toLocaleString()}</td>
                          <td className="text-center p-3 text-slate-700 font-medium">{m.reach.toLocaleString()}</td>
                          <td className="text-center p-3">
                            <a
                              href={m.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-[#6351d5] transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Publish Tab */}
      {activeTab === 'publish' && <>

      {/* Queue section */}
      {scheduleItems.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-bold text-[#032149] mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Cola de publicación ({scheduleItems.length} posts)
          </h2>

          <div className="space-y-4">
            {scheduleItems.map((item, index) => (
              <div
                key={item.post.id}
                className={`bg-white rounded-xl border p-4 transition-all ${
                  item.status === 'published'
                    ? 'border-green-200 bg-green-50/50'
                    : item.status === 'scheduled'
                      ? 'border-blue-200 bg-blue-50/50'
                      : item.status === 'error'
                        ? 'border-red-200 bg-red-50/50'
                        : 'border-slate-200'
                }`}
              >
                <div className="flex gap-4">
                  {/* IG Image preview (vertical) */}
                  <div className="w-20 h-25 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                    {item.igImageUrl ? (
                      <img
                        src={item.igImageUrl}
                        alt={item.post.title}
                        className="w-full h-full object-cover"
                      />
                    ) : item.status === 'generating' ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-[#6351d5] animate-spin" />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#032149] to-[#0faec1]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-[#032149] text-sm line-clamp-1">
                        {item.post.title}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.status === 'draft' && (
                          <>
                            <button
                              onClick={() => setPreviewItem(item)}
                              className="p-1.5 text-slate-400 hover:text-[#6351d5] transition-colors"
                              title="Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => publishItem(index, true)}
                              className="p-1.5 text-slate-400 hover:text-green-600 transition-colors"
                              title="Publicar ahora"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeItem(index)}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              title="Quitar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {item.status === 'generating' && (
                          <span className="text-xs text-slate-400">Generando imagen...</span>
                        )}
                        {item.status === 'publishing' && (
                          <Loader2 className="w-4 h-4 text-[#6351d5] animate-spin" />
                        )}
                        {item.status === 'published' && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                        {item.status === 'scheduled' && (
                          <Clock className="w-5 h-5 text-blue-500" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    </div>

                    {item.status === 'draft' && (
                      <>
                        <textarea
                          value={item.caption}
                          onChange={(e) => updateCaption(index, e.target.value)}
                          rows={3}
                          className="w-full mt-2 text-xs text-slate-600 border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:border-[#6351d5]"
                        />
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => publishItem(index, true)}
                            className="text-xs bg-[#6351d5] text-white px-4 py-1.5 rounded-lg hover:bg-[#5040c0] transition-colors font-medium"
                          >
                            Publicar ahora
                          </button>
                        </div>
                      </>
                    )}

                    {item.status === 'error' && (
                      <p className="text-xs text-red-500 mt-2">{item.error}</p>
                    )}

                    {item.status === 'published' && (
                      <p className="text-xs text-green-600 mt-2">
                        Publicado correctamente
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Post selection */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#032149]">
            Seleccionar posts ({posts.length} disponibles)
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#6351d5]"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <button
              onClick={selectAll}
              className="text-sm text-[#6351d5] hover:underline"
            >
              {selectedPosts.size === filtered.length
                ? 'Deseleccionar'
                : 'Seleccionar todos'}
            </button>
          </div>
        </div>

        {selectedPosts.size > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {selectedPosts.size} seleccionados
            </span>
            <button
              onClick={generateCaptions}
              disabled={generatingCaptions}
              className="flex items-center gap-2 bg-[#6351d5] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#5040c0] transition-colors disabled:opacity-50"
            >
              {generatingCaptions ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Generar imágenes y captions
            </button>
          </div>
        )}

        {/* Posts grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto">
          {filtered.map((post) => {
            const isSelected = selectedPosts.has(post.id);
            const isInQueue = scheduleItems.some((i) => i.post.id === post.id);

            return (
              <button
                key={post.id}
                onClick={() => !isInQueue && togglePost(post.id)}
                disabled={isInQueue}
                className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${
                  isInQueue
                    ? 'border-green-300 opacity-50 cursor-not-allowed'
                    : isSelected
                      ? 'border-[#6351d5] shadow-lg ring-2 ring-[#6351d5]/20'
                      : 'border-transparent hover:border-slate-300'
                }`}
              >
                <div className="aspect-square bg-slate-100 overflow-hidden">
                  {post.image ? (
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#032149] to-[#0faec1] flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-white/30" />
                    </div>
                  )}
                </div>

                <div className="p-2">
                  <p className="text-xs font-medium text-[#032149] line-clamp-2 leading-tight">
                    {post.title}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {post.category}
                  </span>
                </div>

                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-[#6351d5] rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                )}

                {isInQueue && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview modal — Instagram-like with vertical image */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-[#032149]">Vista previa Instagram</h3>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6351d5] to-[#0faec1] flex items-center justify-center">
                  <span className="text-white text-xs font-bold">G4U</span>
                </div>
                <span className="text-sm font-semibold">growth4u_systems</span>
              </div>

              {/* Vertical image preview (4:5 ratio) */}
              {previewItem.igImageUrl ? (
                <img
                  src={previewItem.igImageUrl}
                  alt={previewItem.post.title}
                  className="w-full"
                  style={{ aspectRatio: '4/5' }}
                />
              ) : (
                <div
                  className="w-full bg-gradient-to-br from-[#032149] via-[#1a3690] to-[#0faec1] flex items-center justify-center"
                  style={{ aspectRatio: '4/5' }}
                >
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              )}

              <div className="p-3">
                <p className="text-sm whitespace-pre-line">
                  <span className="font-semibold">growth4u_systems</span>{' '}
                  {previewItem.caption}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for image generation */}
      <canvas ref={previewCanvasRef} className="hidden" />

      </>}
    </div>
  );
}

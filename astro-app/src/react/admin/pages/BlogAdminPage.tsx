import { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Save,
  X,
  FileText,
  Image as ImageIcon,
  Clock,
  User,
  Tag,
  ExternalLink,
  Rocket,
  Loader2,
  CheckCircle,
  Upload,
  Link,
  Sparkles,
  LayoutTemplate
} from 'lucide-react';
import { getAllPosts, createPost, updatePost, deletePost, createSlug } from '../../../lib/firebase-client';
import type { BlogPost, BlogPostInput } from '../../../lib/firebase-client';

const NETLIFY_BUILD_HOOK = 'https://api.netlify.com/build_hooks/69a9ce0e98ff45fea8db5696';
const CLOUDINARY_CLOUD_NAME = 'dsc0jsbkz';
const CLOUDINARY_UPLOAD_PRESET = 'blog_uploads';

export default function BlogAdminPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [publishAfterSave, setPublishAfterSave] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);

  const [formData, setFormData] = useState<BlogPostInput>({
    title: '',
    category: 'Estrategia',
    excerpt: '',
    content: '',
    image: '',
    readTime: '5 min lectura',
    author: 'Equipo Growth4U'
  });

  const categories = [
    'Estrategia',
    'Growth',
    'Marketing',
    'Tech',
    'SEO',
    'GEO',
    'Producto',
    'Ventas'
  ];

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    const allPosts = await getAllPosts();
    setPosts(allPosts);
    setLoading(false);
  };

  const handleNewPost = () => {
    setEditingPost(null);
    setFormData({
      title: '',
      category: 'Estrategia',
      excerpt: '',
      content: '',
      image: '',
      readTime: '5 min lectura',
      author: 'Equipo Growth4U'
    });
    setShowEditor(true);
  };

  const handleEditPost = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      category: post.category,
      excerpt: post.excerpt,
      content: post.content,
      image: post.image,
      readTime: post.readTime,
      author: post.author
    });
    setShowEditor(true);
  };

  const handleDeletePost = async (post: BlogPost) => {
    if (!confirm(`¿Eliminar "${post.title}"? Esta acción no se puede deshacer.`)) return;

    try {
      await deletePost(post.id);
      loadPosts();
      // Trigger deploy after delete
      if (publishAfterSave) {
        triggerDeploy();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Error al eliminar el post');
    }
  };

  const triggerDeploy = async () => {
    setDeploying(true);
    setDeploySuccess(false);
    try {
      await fetch(NETLIFY_BUILD_HOOK, { method: 'POST' });
      setDeploySuccess(true);
      setTimeout(() => setDeploySuccess(false), 5000);
    } catch (error) {
      console.error('Error triggering deploy:', error);
    } finally {
      setDeploying(false);
    }
  };

  const uploadImageToCloudinary = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setFormData(prev => ({ ...prev, image: data.secure_url }));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error al subir la imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      uploadImageToCloudinary(file);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageToCloudinary(file);
    }
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert('El título es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editingPost) {
        await updatePost(editingPost.id, formData);
      } else {
        await createPost(formData);
      }
      setShowEditor(false);
      loadPosts();

      // Trigger deploy after save if checkbox is checked
      if (publishAfterSave) {
        triggerDeploy();
      }
    } catch (error) {
      console.error('Error saving post:', error);
      alert('Error al guardar el post');
    } finally {
      setSaving(false);
    }
  };

  const GEO_TEMPLATE = `# [TÍTULO DEL ARTÍCULO]

> **Respuesta directa**: [2-3 frases que responden directamente la pregunta principal — esto es lo que leerán los LLMs]

## ¿Qué es [TEMA]?

[Definición clara y concisa en 2-3 párrafos. Usa lenguaje que los LLMs puedan citar directamente.]

## ¿Por qué importa [TEMA] para las empresas tech?

[Contexto de relevancia. Incluye estadísticas o datos concretos si los tienes.]

## Cómo [ACCIÓN PRINCIPAL]: Guía paso a paso

### Paso 1: [Nombre del paso]

[Explicación detallada con ejemplos prácticos]

### Paso 2: [Nombre del paso]

[Explicación detallada con ejemplos prácticos]

### Paso 3: [Nombre del paso]

[Explicación detallada con ejemplos prácticos]

## Casos prácticos

| Empresa | Problema | Solución aplicada | Resultado |
|---------|----------|-------------------|-----------|
| [Ejemplo] | [Problema] | [Cómo lo resolvió] | [Resultado medible] |

## Errores comunes a evitar

- **Error 1**: [Descripción breve] → **Solución**: [cómo evitarlo]
- **Error 2**: [Descripción breve] → **Solución**: [cómo evitarlo]
- **Error 3**: [Descripción breve] → **Solución**: [cómo evitarlo]

## Herramientas recomendadas

| Herramienta | Para qué sirve | Precio |
|-------------|----------------|--------|
| [Nombre] | [Uso concreto] | [Gratuito / Desde X€] |

## Preguntas frecuentes

**¿[Pregunta frecuente 1]?**

[Respuesta concisa de 2-3 líneas]

**¿[Pregunta frecuente 2]?**

[Respuesta concisa de 2-3 líneas]

**¿[Pregunta frecuente 3]?**

[Respuesta concisa de 2-3 líneas]

## Conclusión

[Resumen de los puntos clave en 2-3 párrafos. Refuerza la propuesta de valor y el mensaje principal.]

---

*¿Quieres implementar esta estrategia en tu empresa tech? [Agenda una llamada gratuita con Growth4U](https://api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN) y te ayudamos a diseñar tu motor de crecimiento.*`;

  const applyGeoTemplate = () => {
    if (formData.content && !confirm('¿Reemplazar el contenido actual con la plantilla GEO?')) return;
    setFormData(prev => ({ ...prev, content: GEO_TEMPLATE }));
  };

  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';

    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth && line !== '') {
        lines.push(line.trim());
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());

    const totalHeight = lines.length * lineHeight;
    const startY = y - totalHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
  };

  const generateCoverImage = async () => {
    if (!formData.title.trim()) {
      alert('Añade un título antes de generar la portada');
      return;
    }

    setGeneratingCover(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d')!;

      // Background gradient: dark navy (left) → teal (right)
      const bg = ctx.createLinearGradient(0, 0, 1200, 630);
      bg.addColorStop(0, '#032149');
      bg.addColorStop(0.55, '#1a3690');
      bg.addColorStop(1, '#0faec1');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1200, 630);

      // Subtle overlay for depth
      const overlay = ctx.createLinearGradient(0, 0, 0, 630);
      overlay.addColorStop(0, 'rgba(0,0,0,0.25)');
      overlay.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, 1200, 630);

      // Title — centered, bold
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleFontSize = formData.title.length > 60 ? 64 : formData.title.length > 45 ? 72 : 80;
      ctx.font = `bold ${titleFontSize}px Arial, sans-serif`;
      const lineH = titleFontSize * 1.25;
      wrapText(ctx, formData.title, 600, 315, 1060, lineH);

      // Export as blob and upload to Cloudinary
      canvas.toBlob(async (blob) => {
        if (!blob) { setGeneratingCover(false); return; }
        const file = new File([blob], `cover-${Date.now()}.png`, { type: 'image/png' });
        await uploadImageToCloudinary(file);
        setGeneratingCover(false);
      }, 'image/png', 0.95);
    } catch (error) {
      console.error('Error generating cover:', error);
      setGeneratingCover(false);
    }
  };

  const previewSlug = createSlug(formData.title);

  return (
    <div className="space-y-8">
      {/* Deploy Status */}
      {(deploying || deploySuccess) && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${
          deploySuccess ? 'bg-green-500/20 border border-green-500/30' : 'bg-blue-500/20 border border-blue-500/30'
        }`}>
          {deploying ? (
            <>
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <span className="text-blue-300">Publicando cambios en la web...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-green-300">Deploy iniciado. Los cambios estarán visibles en ~1 minuto.</span>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#032149]">Gestión de Blog</h1>
          <p className="text-slate-400 mt-2">Crea, edita y elimina posts del blog</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerDeploy}
            disabled={deploying}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-[#032149] rounded-lg transition-colors"
            title="Publicar cambios manualmente"
          >
            <Rocket className="w-5 h-5" />
            Publicar
          </button>
          <button
            onClick={handleNewPost}
            className="flex items-center gap-2 px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Post
          </button>
        </div>
      </div>

      {/* Auto-publish toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[#032149] font-medium">Publicar automáticamente</p>
          <p className="text-slate-400 text-sm">Los cambios se publican automáticamente al guardar o eliminar un post</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={publishAfterSave}
            onChange={(e) => setPublishAfterSave(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6351d5]"></div>
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Total Posts</span>
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-[#032149] mt-2">{posts.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Categorías</span>
            <Tag className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-[#032149] mt-2">
            {new Set(posts.map(p => p.category)).size}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Último Post</span>
            <Clock className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-lg font-medium text-[#032149] mt-2 truncate">
            {posts[0]?.title || 'Sin posts'}
          </p>
        </div>
      </div>

      {/* Posts List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-[#032149]">Posts Publicados</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No hay posts publicados</p>
            <button
              onClick={handleNewPost}
              className="mt-4 px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg transition-colors"
            >
              Crear primer post
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {posts.map((post) => (
              <div key={post.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                    {post.image ? (
                      <img src={post.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-slate-500" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#032149] truncate">{post.title}</h3>
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">{post.excerpt}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="px-2 py-0.5 bg-slate-100 rounded">{post.category}</span>
                      <span>{post.readTime}</span>
                      <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString('es-ES') : 'Sin fecha'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://growth4u.io/blog/${post.slug}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-[#032149] transition-colors"
                      title="Ver post"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleEditPost(post)}
                      className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePost(post)}
                      className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl my-8">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-[#032149]">
                {editingPost ? 'Editar Post' : 'Nuevo Post'}
              </h2>
              <button
                onClick={() => setShowEditor(false)}
                className="p-2 text-slate-400 hover:text-[#032149] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Editor Form */}
            <form onSubmit={handleSavePost} className="p-6 space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Título *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="Título del post"
                  required
                />
                {formData.title && (
                  <p className="text-slate-500 text-xs mt-1">
                    URL: /blog/{previewSlug}/
                  </p>
                )}
              </div>

              {/* Category & Read Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Categoría
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Tiempo de lectura
                  </label>
                  <input
                    type="text"
                    value={formData.readTime}
                    onChange={(e) => setFormData({ ...formData, readTime: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                    placeholder="5 min lectura"
                  />
                </div>
              </div>

              {/* Author */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Autor
                </label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="Equipo Growth4U"
                />
              </div>

              {/* Image Upload */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Imagen destacada
                  </label>
                  <button
                    type="button"
                    onClick={generateCoverImage}
                    disabled={generatingCover || uploadingImage || !formData.title.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6351d5]/15 hover:bg-[#6351d5]/25 disabled:opacity-40 text-[#6351d5] text-xs font-bold rounded-lg transition-colors"
                    title="Genera una portada automáticamente con el título del post"
                  >
                    {generatingCover ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {generatingCover ? 'Generando...' : 'Generar portada'}
                  </button>
                </div>

                {formData.image ? (
                  <div className="relative">
                    <img
                      src={formData.image}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image: '' })}
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleImageDrop}
                    className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-500 transition-colors"
                  >
                    {uploadingImage ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-[#6351d5] animate-spin" />
                        <span className="text-slate-400">Subiendo imagen...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm mb-2">
                          Arrastra una imagen aquí o
                        </p>
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#032149] rounded-lg cursor-pointer transition-colors">
                          <Upload className="w-4 h-4" />
                          Seleccionar archivo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowUrlInput(!showUrlInput)}
                          className="flex items-center gap-1 mx-auto mt-3 text-slate-500 hover:text-slate-400 text-xs"
                        >
                          <Link className="w-3 h-3" />
                          {showUrlInput ? 'Ocultar URL' : 'O pegar URL'}
                        </button>
                        {showUrlInput && (
                          <input
                            type="url"
                            value={formData.image}
                            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                            className="w-full mt-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[#032149] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                            placeholder="https://..."
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Excerpt */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Extracto (para preview y SEO)
                </label>
                <textarea
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-24"
                  placeholder="Breve descripción del post..."
                />
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Contenido (Markdown)
                  </label>
                  <button
                    type="button"
                    onClick={applyGeoTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#032149] text-xs font-bold rounded-lg transition-colors"
                    title="Carga la plantilla GEO optimizada para LLMs"
                  >
                    <LayoutTemplate className="w-3.5 h-3.5" />
                    Template GEO
                  </button>
                </div>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-96 font-mono text-sm"
                  placeholder="# Título&#10;&#10;Tu contenido en Markdown..."
                />
                <p className="text-slate-500 text-xs mt-1">
                  Usa Markdown para formatear: # Títulos, **negrita**, *cursiva*, - listas, etc.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-[#032149] rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-white border border-slate-200/50 rounded-xl p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-[#032149] mb-2">¿Cómo funciona?</h3>
        <p className="text-slate-400 text-sm">
          Con "Publicar automáticamente" activado, cada vez que guardes o elimines un post se iniciará un deploy en Netlify.
          Los cambios estarán visibles en <span className="text-[#032149]">~1-2 minutos</span>. El sitio usa generación estática (SSG) para máxima velocidad y SEO.
        </p>
        <p className="text-slate-500 text-xs mt-3">
          Si necesitas publicar manualmente, usa el botón "Publicar" en la cabecera o visita{' '}
          <a href="https://app.netlify.com" target="_blank" rel="noopener noreferrer" className="text-[#6351d5] hover:underline">
            Netlify
          </a>
        </p>
      </div>
    </div>
  );
}

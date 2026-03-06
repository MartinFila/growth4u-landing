import { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Download,
  Rocket,
  Loader2,
  CheckCircle,
  Upload,
  Link,
  Users,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import {
  getAllLeadMagnets,
  createLeadMagnet,
  updateLeadMagnet,
  deleteLeadMagnet,
  getAllLeadMagnetLeads,
  createSlug,
} from '../../../lib/firebase-client';
import type { LeadMagnetInput } from '../../../lib/firebase-client';

const NETLIFY_BUILD_HOOK = 'https://api.netlify.com/build_hooks/69a9ce0e98ff45fea8db5696';
const CLOUDINARY_CLOUD_NAME = 'dsc0jsbkz';
const CLOUDINARY_UPLOAD_PRESET = 'blog_uploads';

type LeadMagnet = {
  id: string;
  title: string;
  slug: string;
  description: string;
  image: string;
  excerpt: string;
  content: string;
  contentUrl: string;
  published: boolean;
  createdAt: Date | null;
};

export default function LeadMagnetsAdminPage() {
  const [magnets, setMagnets] = useState<LeadMagnet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMagnet, setEditingMagnet] = useState<LeadMagnet | null>(null);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [publishAfterSave, setPublishAfterSave] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [showLeads, setShowLeads] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const [formData, setFormData] = useState<LeadMagnetInput>({
    title: '',
    slug: '',
    description: '',
    image: '',
    excerpt: '',
    content: '',
    contentUrl: '',
    published: true,
  });

  useEffect(() => { loadMagnets(); }, []);

  const loadMagnets = async () => {
    setLoading(true);
    const all = await getAllLeadMagnets();
    setMagnets(all as LeadMagnet[]);
    setLoading(false);
  };

  const handleNew = () => {
    setEditingMagnet(null);
    setSlugManuallyEdited(false);
    setFormData({ title: '', slug: '', description: '', image: '', excerpt: '', content: '', contentUrl: '', published: true });
    setShowUrlInput(false);
    setShowEditor(true);
  };

  const handleEdit = (magnet: LeadMagnet) => {
    setEditingMagnet(magnet);
    setSlugManuallyEdited(true);
    setFormData({ title: magnet.title, slug: magnet.slug, description: magnet.description, image: magnet.image, excerpt: magnet.excerpt, content: magnet.content, contentUrl: magnet.contentUrl, published: magnet.published });
    setShowUrlInput(false);
    setShowEditor(true);
  };

  const handleTitleChange = (value: string) => {
    const update: Partial<LeadMagnetInput> = { title: value };
    if (!slugManuallyEdited) update.slug = createSlug(value);
    setFormData(prev => ({ ...prev, ...update }));
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setFormData(prev => ({ ...prev, slug: value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '') }));
  };

  const handleDelete = async (magnet: LeadMagnet) => {
    if (!confirm(`¿Eliminar el lead magnet "${magnet.title}"?`)) return;
    try {
      await deleteLeadMagnet(magnet.id);
      loadMagnets();
      if (publishAfterSave) triggerDeploy();
    } catch (error) {
      alert('Error al eliminar');
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
      console.error('Deploy error:', error);
    } finally {
      setDeploying(false);
    }
  };

  const uploadImageToCloudinary = async (file: File) => {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      setFormData(prev => ({ ...prev, image: data.secure_url }));
    } catch (error) {
      alert('Error al subir la imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) { alert('El título es obligatorio'); return; }
    if (!formData.slug.trim()) { alert('El slug es obligatorio'); return; }
    setSaving(true);
    try {
      if (editingMagnet) {
        await updateLeadMagnet(editingMagnet.id, formData);
      } else {
        await createLeadMagnet(formData);
      }
      setShowEditor(false);
      loadMagnets();
      if (publishAfterSave && formData.published) triggerDeploy();
    } catch (error) {
      alert('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleShowLeads = async (slug: string) => {
    setShowLeads(slug);
    setLoadingLeads(true);
    const all = await getAllLeadMagnetLeads();
    setLeads(all.filter((l: any) => l.magnetSlug === slug));
    setLoadingLeads(false);
  };

  const handleCopyUrl = (slug: string) => {
    navigator.clipboard.writeText(`https://growth4u.io/recursos/${slug}/`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Deploy Status */}
      {(deploying || deploySuccess) && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${deploySuccess ? 'bg-green-500/20 border border-green-500/30' : 'bg-blue-500/20 border border-blue-500/30'}`}>
          {deploying ? (
            <><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /><span className="text-blue-300">Publicando cambios...</span></>
          ) : (
            <><CheckCircle className="w-5 h-5 text-green-400" /><span className="text-green-300">Deploy iniciado. Los cambios estarán visibles en ~1 minuto.</span></>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#032149]">Lead Magnets</h1>
          <p className="text-slate-400 mt-2">Recursos descargables con captura de leads</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={triggerDeploy} disabled={deploying} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-[#032149] rounded-lg transition-colors">
            <Rocket className="w-5 h-5" />Publicar
          </button>
          <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg transition-colors">
            <Plus className="w-5 h-5" />Nuevo Lead Magnet
          </button>
        </div>
      </div>

      {/* Auto-publish toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[#032149] font-medium">Publicar automáticamente</p>
          <p className="text-slate-400 text-sm">Los cambios se publican al guardar lead magnets publicados</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={publishAfterSave} onChange={(e) => setPublishAfterSave(e.target.checked)} className="sr-only peer" />
          <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6351d5]"></div>
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Total</span>
            <Download className="w-5 h-5 text-[#6351d5]" />
          </div>
          <p className="text-3xl font-bold text-[#032149] mt-2">{magnets.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Publicados</span>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-[#032149] mt-2">{magnets.filter(m => m.published).length}</p>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-[#032149]">Lead Magnets</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando...</div>
        ) : magnets.length === 0 ? (
          <div className="p-8 text-center">
            <Download className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No hay lead magnets todavía</p>
            <button onClick={handleNew} className="mt-4 px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg transition-colors">
              Crear primer lead magnet
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {magnets.map((magnet) => (
              <div key={magnet.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                    {magnet.image ? (
                      <img src={magnet.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#6351d5] to-[#3f45fe]">
                        <Download className="w-6 h-6 text-[#032149]" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-[#032149] truncate">{magnet.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${magnet.published ? 'bg-green-500/20 text-green-400' : 'bg-slate-600 text-slate-400'}`}>
                        {magnet.published ? 'Publicado' : 'Borrador'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm line-clamp-1">{magnet.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-slate-500 text-xs">growth4u.io/recursos/{magnet.slug}/</p>
                      <button
                        onClick={() => handleCopyUrl(magnet.slug)}
                        className="p-0.5 text-slate-400 hover:text-[#6351d5] transition-colors"
                        title="Copiar URL"
                      >
                        {copiedSlug === magnet.slug
                          ? <Check className="w-3 h-3 text-green-500" />
                          : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`https://growth4u.io/recursos/${magnet.slug}/`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-[#032149] transition-colors" title="Ver página">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button onClick={() => handleShowLeads(magnet.slug)} className="p-2 text-slate-400 hover:text-yellow-400 transition-colors" title="Ver leads">
                      <Users className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(magnet)} className="p-2 text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(magnet)} className="p-2 text-slate-400 hover:text-red-400 transition-colors" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leads Modal */}
      {showLeads && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-[#032149] flex items-center gap-2">
                <Users className="w-5 h-5 text-yellow-400" />
                Leads — {showLeads}
              </h2>
              <button onClick={() => setShowLeads(null)} className="p-2 text-slate-400 hover:text-[#032149]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {loadingLeads ? (
                <div className="text-center text-slate-400 py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : leads.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No hay leads todavía</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-400 text-sm">{leads.length} lead{leads.length !== 1 ? 's' : ''}</p>
                  {leads.map((lead) => (
                    <div key={lead.id} className="bg-slate-100 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[#032149] font-medium">{lead.nombre}</p>
                          <p className="text-slate-300 text-sm">{lead.email}</p>
                          {lead.tag && <p className="text-slate-400 text-sm mt-1">🔍 "{lead.tag}"</p>}
                        </div>
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString('es-ES') : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-[#032149]">{editingMagnet ? 'Editar Lead Magnet' : 'Nuevo Lead Magnet'}</h2>
              <button onClick={() => setShowEditor(false)} className="p-2 text-slate-400 hover:text-[#032149]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Título *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="Ej: Guía GEO para Empresas Tech 2026"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  URL (slug) * <span className="text-slate-500 font-normal">— growth4u.io/recursos/<span className="text-[#6351d5]">{formData.slug || 'tu-slug'}</span>/</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] font-mono"
                  placeholder="guia-geo-empresas tech-2026"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Descripción (landing page)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-28"
                  placeholder="Describe qué recibirá el lead y por qué es valioso..."
                />
              </div>

              {/* Excerpt */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Extracto visible <span className="text-slate-400 font-normal">— contenido gratuito mostrado antes del gate (Markdown)</span>
                </label>
                <textarea
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] font-mono text-sm h-48"
                  placeholder="## El problema que resuelves&#10;&#10;Escribe aquí el contenido libre que verán todos los visitantes antes de dejar sus datos..."
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Contenido completo <span className="text-slate-400 font-normal">— bloqueado hasta que dejen sus datos (Markdown)</span>
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] font-mono text-sm h-96"
                  placeholder="## Parte 1: ...&#10;&#10;El framework completo, checklist, plan de acción..."
                />
              </div>

              {/* Content URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  URL de descarga <span className="text-slate-400 font-normal">— opcional, botón de descarga que aparece tras desbloquear</span>
                </label>
                <input
                  type="url"
                  value={formData.contentUrl}
                  onChange={(e) => setFormData({ ...formData, contentUrl: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="https://drive.google.com/... (dejar vacío si el contenido es inline)"
                />
              </div>

              {/* Image */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Imagen de portada</label>
                {formData.image ? (
                  <div className="relative">
                    <img src={formData.image} alt="Preview" className="w-full h-48 object-cover rounded-lg border border-slate-200" />
                    <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) uploadImageToCloudinary(f); }} className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-500 transition-colors">
                    {uploadingImage ? (
                      <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-[#6351d5] animate-spin" /><span className="text-slate-400">Subiendo...</span></div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm mb-2">Arrastra una imagen o</p>
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#032149] rounded-lg cursor-pointer transition-colors">
                          <Upload className="w-4 h-4" />Seleccionar
                          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImageToCloudinary(f); }} className="hidden" />
                        </label>
                        <button type="button" onClick={() => setShowUrlInput(!showUrlInput)} className="flex items-center gap-1 mx-auto mt-3 text-slate-500 hover:text-slate-400 text-xs">
                          <Link className="w-3 h-3" />{showUrlInput ? 'Ocultar' : 'O pegar URL'}
                        </button>
                        {showUrlInput && (
                          <input type="url" value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} className="w-full mt-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[#032149] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]" placeholder="https://..." />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Published toggle */}
              <div className="flex items-center justify-between bg-slate-100 rounded-lg p-4">
                <div>
                  <p className="text-[#032149] font-medium">Publicado</p>
                  <p className="text-slate-400 text-sm">La landing page será accesible en /recursos/{formData.slug}/</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={formData.published} onChange={(e) => setFormData({ ...formData, published: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6351d5]"></div>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setShowEditor(false)} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-[#032149] rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-[#6351d5] hover:bg-[#5242b8] disabled:bg-slate-600 text-white rounded-lg transition-colors">
                  <Save className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

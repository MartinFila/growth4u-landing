import { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Trophy,
  Image as ImageIcon,
  ExternalLink,
  Rocket,
  Loader2,
  CheckCircle,
  Upload,
  Link,
  Video,
  FileImage
} from 'lucide-react';
import { getAllCaseStudies, createCaseStudy, updateCaseStudy, deleteCaseStudy, createSlug } from '../../../lib/firebase-client';
import type { CaseStudy, CaseStudyInput } from '../../../lib/firebase-client';

const NETLIFY_BUILD_HOOK = 'https://api.netlify.com/build_hooks/69a9ce0e98ff45fea8db5696';
const CLOUDINARY_CLOUD_NAME = 'dsc0jsbkz';
const CLOUDINARY_UPLOAD_PRESET = 'blog_uploads';

export default function CasosAdminPage() {
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseStudy | null>(null);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [publishAfterSave, setPublishAfterSave] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const [formData, setFormData] = useState<CaseStudyInput>({
    company: '',
    logo: '',
    stat: '',
    statLabel: '',
    highlight: '',
    summary: '',
    challenge: '',
    solution: '',
    results: [],
    testimonial: '',
    testimonialAuthor: '',
    testimonialRole: '',
    image: '',
    videoUrl: '',
    content: '',
    mediaUrl: ''
  });

  const [newResult, setNewResult] = useState('');

  useEffect(() => {
    loadCaseStudies();
  }, []);

  const loadCaseStudies = async () => {
    setLoading(true);
    const allCases = await getAllCaseStudies();
    setCaseStudies(allCases);
    setLoading(false);
  };

  const handleNewCase = () => {
    setEditingCase(null);
    setFormData({
      company: '',
      logo: '',
      stat: '',
      statLabel: '',
      highlight: '',
      summary: '',
      challenge: '',
      solution: '',
      results: [],
      testimonial: '',
      testimonialAuthor: '',
      testimonialRole: '',
      image: '',
      videoUrl: '',
      content: '',
      mediaUrl: ''
    });
    setShowEditor(true);
  };

  const handleEditCase = (caseStudy: CaseStudy) => {
    setEditingCase(caseStudy);
    setFormData({
      company: caseStudy.company,
      logo: caseStudy.logo,
      stat: caseStudy.stat,
      statLabel: caseStudy.statLabel,
      highlight: caseStudy.highlight,
      summary: caseStudy.summary,
      challenge: caseStudy.challenge,
      solution: caseStudy.solution,
      results: caseStudy.results || [],
      testimonial: caseStudy.testimonial,
      testimonialAuthor: caseStudy.testimonialAuthor,
      testimonialRole: caseStudy.testimonialRole,
      image: caseStudy.image,
      videoUrl: caseStudy.videoUrl || '',
      content: caseStudy.content,
      mediaUrl: caseStudy.mediaUrl || ''
    });
    setShowEditor(true);
  };

  const handleDeleteCase = async (caseStudy: CaseStudy) => {
    if (!confirm(`¿Eliminar el caso de "${caseStudy.company}"? Esta acción no se puede deshacer.`)) return;

    try {
      await deleteCaseStudy(caseStudy.id);
      loadCaseStudies();
      if (publishAfterSave) {
        triggerDeploy();
      }
    } catch (error) {
      console.error('Error deleting case study:', error);
      alert('Error al eliminar el caso de éxito');
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
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formDataUpload }
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

  const addResult = () => {
    if (newResult.trim()) {
      setFormData(prev => ({
        ...prev,
        results: [...prev.results, newResult.trim()]
      }));
      setNewResult('');
    }
  };

  const removeResult = (index: number) => {
    setFormData(prev => ({
      ...prev,
      results: prev.results.filter((_, i) => i !== index)
    }));
  };

  const handleSaveCase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.company.trim()) {
      alert('El nombre de la empresa es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editingCase) {
        await updateCaseStudy(editingCase.id, formData);
      } else {
        await createCaseStudy(formData);
      }
      setShowEditor(false);
      loadCaseStudies();

      if (publishAfterSave) {
        triggerDeploy();
      }
    } catch (error) {
      console.error('Error saving case study:', error);
      alert('Error al guardar el caso de éxito');
    } finally {
      setSaving(false);
    }
  };

  const previewSlug = createSlug(formData.company);

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
          <h1 className="text-3xl font-bold text-[#032149]">Casos de Éxito</h1>
          <p className="text-slate-400 mt-2">Gestiona los casos de éxito de tus clientes</p>
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
            onClick={handleNewCase}
            className="flex items-center gap-2 px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Caso
          </button>
        </div>
      </div>

      {/* Auto-publish toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[#032149] font-medium">Publicar automáticamente</p>
          <p className="text-slate-400 text-sm">Los cambios se publican automáticamente al guardar</p>
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
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Total Casos de Éxito</span>
          <Trophy className="w-5 h-5 text-yellow-400" />
        </div>
        <p className="text-3xl font-bold text-[#032149] mt-2">{caseStudies.length}</p>
      </div>

      {/* Case Studies List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-[#032149]">Casos Publicados</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando...</div>
        ) : caseStudies.length === 0 ? (
          <div className="p-8 text-center">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No hay casos de éxito publicados</p>
            <button
              onClick={handleNewCase}
              className="mt-4 px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg transition-colors"
            >
              Crear primer caso
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {caseStudies.map((caseStudy) => (
              <div key={caseStudy.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                    {caseStudy.image ? (
                      <img src={caseStudy.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#6351d5] to-[#3f45fe]">
                        <span className="text-[#032149] font-bold text-lg">{caseStudy.company.charAt(0)}</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#032149]">{caseStudy.company}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-bold text-[#6351d5]">{caseStudy.stat}</span>
                      <span className="text-slate-400">{caseStudy.statLabel}</span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1 line-clamp-1">{caseStudy.summary}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://growth4u.io/casos-de-exito/${caseStudy.slug}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-[#032149] transition-colors"
                      title="Ver caso"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleEditCase(caseStudy)}
                      className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCase(caseStudy)}
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
                {editingCase ? 'Editar Caso de Éxito' : 'Nuevo Caso de Éxito'}
              </h2>
              <button
                onClick={() => setShowEditor(false)}
                className="p-2 text-slate-400 hover:text-[#032149] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Editor Form */}
            <form onSubmit={handleSaveCase} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Company & Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Empresa *
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                    placeholder="Ej: BNEXT"
                    required
                  />
                  {formData.company && (
                    <p className="text-slate-500 text-xs mt-1">
                      URL: /casos-de-exito/{previewSlug}/
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Estadística Principal *
                  </label>
                  <input
                    type="text"
                    value={formData.stat}
                    onChange={(e) => setFormData({ ...formData, stat: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                    placeholder="Ej: 500K, -70%, 10K €"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Label de Estadística
                  </label>
                  <input
                    type="text"
                    value={formData.statLabel}
                    onChange={(e) => setFormData({ ...formData, statLabel: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                    placeholder="Ej: Usuarios activos"
                  />
                </div>
              </div>

              {/* Highlight */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Highlight (frase corta)
                </label>
                <input
                  type="text"
                  value={formData.highlight}
                  onChange={(e) => setFormData({ ...formData, highlight: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="Ej: conseguidos en 30 meses"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Resumen
                </label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-20"
                  placeholder="Breve descripción del caso..."
                />
              </div>

              {/* Challenge & Solution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    El Reto
                  </label>
                  <textarea
                    value={formData.challenge}
                    onChange={(e) => setFormData({ ...formData, challenge: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-32"
                    placeholder="¿Cuál era el problema?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    La Solución
                  </label>
                  <textarea
                    value={formData.solution}
                    onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-32"
                    placeholder="¿Cómo lo solucionamos?"
                  />
                </div>
              </div>

              {/* Results */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Resultados Clave
                </label>
                <div className="space-y-2">
                  {formData.results.map((result, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1 px-4 py-2 bg-slate-100 rounded-lg text-[#032149] text-sm">
                        {result}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeResult(index)}
                        className="p-2 text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newResult}
                      onChange={(e) => setNewResult(e.target.value)}
                      className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                      placeholder="Añadir resultado..."
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResult())}
                    />
                    <button
                      type="button"
                      onClick={addResult}
                      className="px-4 py-2 bg-[#6351d5] hover:bg-[#5242b8] text-white rounded-lg"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Imagen destacada
                </label>

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

              {/* Video URL */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Video className="w-4 h-4 inline mr-2" />
                  URL del Video (YouTube, Vimeo, etc.)
                </label>
                <input
                  type="url"
                  value={formData.videoUrl}
                  onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="https://www.youtube.com/watch?v=... o https://vimeo.com/..."
                />
                <p className="text-slate-500 text-xs mt-1">
                  Soporta YouTube y otros servicios de video. Se mostrará como embed en la página.
                </p>
                {formData.videoUrl && (
                  <div className="mt-3 bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 text-xs mb-2">Vista previa:</p>
                    <div className="relative w-full pt-[56.25%] rounded overflow-hidden">
                      <iframe
                        src={formData.videoUrl.includes('youtube.com/watch')
                          ? formData.videoUrl.replace('watch?v=', 'embed/')
                          : formData.videoUrl.includes('youtu.be/')
                            ? formData.videoUrl.replace('youtu.be/', 'youtube.com/embed/')
                            : formData.videoUrl
                        }
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Video preview"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Media URL (additional image/graphic) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <FileImage className="w-4 h-4 inline mr-2" />
                  URL de Media adicional (gráfico, infografía)
                </label>
                <input
                  type="url"
                  value={formData.mediaUrl}
                  onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                  placeholder="https://..."
                />
                {formData.mediaUrl && (
                  <img
                    src={formData.mediaUrl}
                    alt="Media preview"
                    className="mt-3 max-h-40 rounded-lg border border-slate-200"
                  />
                )}
              </div>

              {/* Testimonial */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Testimonio (opcional)
                </label>
                <textarea
                  value={formData.testimonial}
                  onChange={(e) => setFormData({ ...formData, testimonial: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-24"
                  placeholder="Cita del cliente..."
                />
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <input
                    type="text"
                    value={formData.testimonialAuthor}
                    onChange={(e) => setFormData({ ...formData, testimonialAuthor: e.target.value })}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                    placeholder="Nombre del autor"
                  />
                  <input
                    type="text"
                    value={formData.testimonialRole}
                    onChange={(e) => setFormData({ ...formData, testimonialRole: e.target.value })}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5]"
                    placeholder="Cargo"
                  />
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Contenido detallado (Markdown)
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[#032149] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6351d5] h-48 font-mono text-sm"
                  placeholder="## Contexto&#10;&#10;Contenido adicional en Markdown..."
                />
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
                  {saving ? 'Guardando...' : 'Guardar Caso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

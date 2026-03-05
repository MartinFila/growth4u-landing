import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  LogOut,
  Menu,
  X,
  Loader2,
  FileText,
  MessageSquare,
  Trophy,
  Download,
  Users,
  Camera,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { signInWithGoogle, signOutUser, onAuthChange } from '../../lib/firebase-client';

export default function AdminLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setError('');
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
    }
    setSigningIn(false);
  };

  const handleLogout = async () => {
    await signOutUser();
  };

  const navigation = [
    { name: 'Dashboard', href: '/admin/', icon: LayoutDashboard },
    { name: 'Blog', href: '/admin/blog/', icon: FileText },
    { name: 'Casos de Éxito', href: '/admin/casos-de-exito/', icon: Trophy },
    { name: 'Lead Magnets', href: '/admin/lead-magnets/', icon: Download },
    { name: 'Instagram', href: '/admin/instagram/', icon: Camera },
    { name: 'SEO & GEO', href: '/admin/seo/', icon: Search },
    { name: 'Feedback', href: '/admin/feedback/', icon: MessageSquare },
    { name: 'Leads', href: '/admin/leads/', icon: Users },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#6351d5] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl border border-slate-200">
          <div className="text-center mb-8">
            <img src="https://i.imgur.com/imHxGWI.png" alt="Growth4U" className="h-8 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#032149]">Panel Admin</h1>
            <p className="text-slate-500 mt-2">Dashboard SEO & GEO</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 border border-slate-200 shadow-sm"
          >
            {signingIn ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {signingIn ? 'Iniciando sesión...' : 'Continuar con Google'}
          </button>

          <p className="text-slate-400 text-xs text-center mt-4">
            Solo cuentas @growth4u.io
          </p>
        </div>
      </div>
    );
  }

  // Normalize pathname for comparison (handle with/without trailing slash)
  const normalizedPath = pathname.endsWith('/') ? pathname : pathname + '/';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 bg-white rounded-lg text-slate-600 border border-slate-200 shadow-sm"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-200">
            <a href="/" className="flex items-center gap-2">
              <img src="https://i.imgur.com/imHxGWI.png" alt="Growth4U" className="h-6" />
            </a>
            <p className="text-xs text-slate-500 mt-2">Dashboard SEO & GEO</p>
          </div>

          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#032149] truncate">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = normalizedPath === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#6351d5] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

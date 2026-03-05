import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import DashboardPage from './pages/DashboardPage';
import BlogAdminPage from './pages/BlogAdminPage';
import CasosAdminPage from './pages/CasosAdminPage';
import SeoPage from './pages/SeoPage';
import GeoPage from './pages/GeoPage';
import ValidationPage from './pages/ValidationPage';
import ChecklistPage from './pages/ChecklistPage';
import FeedbackAdminPage from './pages/FeedbackAdminPage';
import LeadMagnetsAdminPage from './pages/LeadMagnetsAdminPage';
import LeadsAdminPage from './pages/LeadsAdminPage';
import InstagramPage from './pages/InstagramPage';

export default function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin/" element={<DashboardPage />} />
          <Route path="/admin/blog/" element={<BlogAdminPage />} />
          <Route path="/admin/casos-de-exito/" element={<CasosAdminPage />} />
          <Route path="/admin/lead-magnets/" element={<LeadMagnetsAdminPage />} />
          <Route path="/admin/instagram/" element={<InstagramPage />} />
          <Route path="/admin/seo/" element={<SeoPage />} />
          <Route path="/admin/geo/" element={<GeoPage />} />
          <Route path="/admin/validation/" element={<ValidationPage />} />
          <Route path="/admin/checklist/" element={<ChecklistPage />} />
          <Route path="/admin/feedback/" element={<FeedbackAdminPage />} />
          <Route path="/admin/leads/" element={<LeadsAdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

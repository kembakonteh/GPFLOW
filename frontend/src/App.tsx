import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute       from './components/layout/ProtectedRoute';
import LoginPage            from './pages/LoginPage';
import RegisterPage         from './pages/RegisterPage';
import DashboardPage        from './pages/DashboardPage';
import PublicTripPage       from './pages/PublicTripPage';
import BookingFormPage      from './pages/BookingFormPage';
import BookingConfirmedPage from './pages/BookingConfirmedPage';
import TrackingPage         from './pages/TrackingPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Operator auth ───────────────────────────────────────────────── */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* ── Operator dashboard (protected) ──────────────────────────────── */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

        {/* ── Public customer pages (no auth) ─────────────────────────────── */}
        <Route path="/trip/:slug"      element={<PublicTripPage />} />
        <Route path="/trip/:slug/book" element={<BookingFormPage />} />

        {/* Post-booking confirmation */}
        <Route path="/booking/:reference/confirmed" element={<BookingConfirmedPage />} />

        {/* Parcel tracking — supports both /track/:ref and /track/:reference */}
        <Route path="/track/:ref"       element={<TrackingPage />} />
        <Route path="/track/:reference" element={<TrackingPage />} />

        {/* ── Fallback ─────────────────────────────────────────────────────── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/layout/Layout'

// Auth / public pages (no sidebar)
import LoginPage from './pages/LoginPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import InterestResponsePage from './pages/InterestResponsePage'

// App pages (protected — inside sidebar layout)
import DashboardPage from './pages/DashboardPage'
import JDGeneratorPage from './pages/JDGeneratorPage'
import ResumeScreenerPage from './pages/ResumeScreenerPage'
import InterviewPage from './pages/InterviewPage'
import CommunicationPage from './pages/CommunicationPage'
import SchedulePage from './pages/SchedulePage'
import UsersPage from './pages/UsersPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>

        {/* ── Public routes (no auth) ───────────────────────────────────── */}
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/accept-invite"   element={<AcceptInvitePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password"  element={<ResetPasswordPage />} />
        <Route path="/schedule/:token"   element={<SchedulePage />} />
        <Route path="/interest-response" element={<InterestResponsePage />} />

        {/* ── Protected app routes (inside Layout) ──────────────────────── */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <ErrorBoundary label="This page">
                  <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard"       element={<DashboardPage />} />
                  <Route path="/jd-generator"    element={<JDGeneratorPage />} />
                  <Route path="/resume-screener" element={<ResumeScreenerPage />} />
                  <Route path="/interview"       element={<InterviewPage />} />
                  <Route path="/communication"   element={<CommunicationPage />} />
                  <Route path="/profile"         element={<ProfilePage />} />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute roles={['super_admin', 'hr_admin']}>
                        <UsersPage />
                      </ProtectedRoute>
                    }
                  />
                  </Routes>
                </ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}

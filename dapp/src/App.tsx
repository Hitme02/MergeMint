import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { NavDefault as Navbar } from './components/Navbar'
import Footer from './components/Footer'
import { Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import ProtectedRoute from './routes/ProtectedRoute'
import AuthRoute from './routes/AuthRoute'
import Login from './pages/Login'
import OwnerDashboard from './layouts/OwnerDashboard'
import ContributorDashboard from './layouts/ContributorDashboard'
import { useUser } from './context/UserContext'

const Home = lazy(() => import('./pages/Home'))
const BindWallet = lazy(() => import('./pages/BindWallet'))
const Contributions = lazy(() => import('./pages/Contributions'))
const TxViewer = lazy(() => import('./pages/TxViewer'))
const Events = lazy(() => import('./pages/Events'))
const Owner = lazy(() => import('./pages/Owner'))
const OwnerVerifier = lazy(() => import('./pages/OwnerVerifier'))
const OwnerPool = lazy(() => import('./pages/OwnerPool'))
const OwnerPRs = lazy(() => import('./pages/OwnerPRs'))
const MyPRs = lazy(() => import('./pages/MyPRs'))
const Help = lazy(() => import('./pages/Help'))
const AuthStart = lazy(() => import('./pages/AuthStart'))

export default function App() {
  const location = useLocation()
  const { authed } = useUser()
  const showChrome = authed || location.pathname.startsWith('/home') || location.pathname.startsWith('/help')
  return (
    <div className="min-h-screen bg-animated bg-grid-dots bg-grid-dots">
      {showChrome && <Navbar />}
      <div className="pt-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <Suspense fallback={<div className="pt-32 text-center text-zinc-400">Loading…</div>}>
              <Routes location={location}>
                <Route path="/" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/home" element={<Home />} />
                <Route path="/auth" element={<AuthStart />} />
                <Route path="/bind" element={<BindWallet />} />
                <Route path="/help" element={<Help />} />
                <Route path="/tx/:hash" element={<AuthRoute><TxViewer /></AuthRoute>} />
                <Route path="/events" element={<AuthRoute><Events /></AuthRoute>} />
                <Route path="/contributions" element={<ProtectedRoute role="contributor"><Contributions /></ProtectedRoute>} />
                <Route path="/my-prs" element={<ProtectedRoute role="contributor"><MyPRs /></ProtectedRoute>} />
                <Route path="/owner" element={<ProtectedRoute role="owner"><OwnerDashboard /></ProtectedRoute>} />
                <Route path="/owner/settings" element={<ProtectedRoute role="owner"><Owner /></ProtectedRoute>} />
                <Route path="/owner/verifier" element={<ProtectedRoute role="owner"><OwnerVerifier /></ProtectedRoute>} />
                <Route path="/owner/pool" element={<ProtectedRoute role="owner"><OwnerPool /></ProtectedRoute>} />
                <Route path="/owner/prs" element={<ProtectedRoute role="owner"><OwnerPRs /></ProtectedRoute>} />
                <Route path="/contributor" element={<ProtectedRoute role="contributor"><ContributorDashboard /></ProtectedRoute>} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
  {showChrome && <Footer />}
      <Toaster position="top-right" />
    </div>
  )
}

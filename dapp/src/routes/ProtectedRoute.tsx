import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'

export default function ProtectedRoute({ role, children }: { role: 'owner'|'contributor'; children: any }) {
  const { role: current, authed } = useUser()
  if (!authed) return <Navigate to="/login" replace />
  if (!current || current !== role) return <Navigate to="/login" replace />
  return children
}

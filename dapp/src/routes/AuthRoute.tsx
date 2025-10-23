import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'

export default function AuthRoute({ children }: { children: any }) {
  const { authed } = useUser()
  if (!authed) return <Navigate to="/login" replace />
  return children
}

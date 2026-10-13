import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import type { Role } from './api/client'
import { Layout } from './components/Layout'
import { ClassesPage } from './pages/ClassesPage'
import { DashboardPage } from './pages/DashboardPage'
import { EvaluationsPage } from './pages/EvaluationsPage'
import { GradesPage } from './pages/GradesPage'
import { LoginPage } from './pages/LoginPage'
import { PetPage } from './pages/PetPage'
import { PlayQuizPage } from './pages/PlayQuizPage'
import { QuizEditorPage } from './pages/QuizEditorPage'
import { QuizzesPage } from './pages/QuizzesPage'
import { useAuthStore } from './stores/auth'

/** Redirige vers la connexion sans utilisateur, et vers l'accueil si le rôle ne convient pas. */
function RequireAuth({ role }: { role?: Role }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/connexion" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="connexion" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<QuizzesPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="evaluations" element={<EvaluationsPage />} />
            <Route path="notes" element={<GradesPage />} />
            <Route element={<RequireAuth role="student" />}>
              <Route path="dragon" element={<PetPage />} />
              <Route path="quiz/:quizId" element={<PlayQuizPage />} />
            </Route>
            <Route element={<RequireAuth role="trainer" />}>
              <Route path="suivi" element={<DashboardPage />} />
              <Route path="quiz/:quizId/modifier" element={<QuizEditorPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

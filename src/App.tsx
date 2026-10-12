import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CardsPage } from './pages/CardsPage'
import { CoursePage } from './pages/CoursePage'
import { CoursesPage } from './pages/CoursesPage'
import { DeadlinesPage } from './pages/DeadlinesPage'
import { GradesPage } from './pages/GradesPage'
import { ImportCoursePage } from './pages/ImportCoursePage'
import { PetPage } from './pages/PetPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CoursesPage />} />
          <Route path="importer" element={<ImportCoursePage />} />
          <Route path="cours/:courseId" element={<CoursePage />} />
          <Route path="fiches" element={<CardsPage />} />
          <Route path="reviser" element={<ReviewPage />} />
          <Route path="echeances" element={<DeadlinesPage />} />
          <Route path="notes" element={<GradesPage />} />
          <Route path="dragon" element={<PetPage />} />
          <Route path="reglages" element={<SettingsPage />} />
          <Route path="*" element={<CoursesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

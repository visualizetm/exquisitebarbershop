import { BrowserRouter, Route, Routes } from 'react-router';
import { AdminLayout, PublicLayout } from './Layout';
import { AdminPage } from '@/pages/AdminPage';
import { BookPage } from '@/pages/BookPage';
import { ChairPage } from '@/pages/ChairPage';
import { ChairsPage } from '@/pages/ChairsPage';
import { GalleryPage } from '@/pages/GalleryPage';
import { HomePage } from '@/pages/HomePage';
import { ManagePage } from '@/pages/ManagePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { VisitPage } from '@/pages/VisitPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="chairs" element={<ChairsPage />} />
          <Route path="chairs/:slug" element={<ChairPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="visit" element={<VisitPage />} />
          <Route path="book" element={<BookPage />} />
          <Route path="manage" element={<ManagePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminPage />} />
          <Route path="*" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

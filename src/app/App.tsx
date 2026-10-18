import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AdminLayout, PublicLayout, TeamLayout } from './Layout';
import { BookPage } from '@/pages/BookPage';
import { ChairPage } from '@/pages/ChairPage';
import { ChairsPage } from '@/pages/ChairsPage';
import { GalleryPage } from '@/pages/GalleryPage';
import { HomePage } from '@/pages/HomePage';
import { ManagePage } from '@/pages/ManagePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { SetupPage } from '@/pages/SetupPage';
import { VisitPage } from '@/pages/VisitPage';
import { Status } from '@/components/Status';
import { DemoNotice } from '@/components/site/DemoNotice';

// The staff area is its own chunk: public visitors never download it.
const AdminApp = lazy(() => import('@/admin/AdminApp'));
// The barber portal is another chunk of its own, for the same reason.
const TeamApp = lazy(() => import('@/team/TeamApp'));
// The kit showcase exists only in development builds, for visual checks and screenshots.
const KitPage = import.meta.env.DEV ? lazy(() => import('@/pages/KitPage')) : null;

export function App() {
  return (
    <BrowserRouter>
      <DemoNotice />
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
          <Route path="setup" element={<SetupPage />} />
          {KitPage ? (
            <Route
              path="kit"
              element={
                <Suspense fallback={<Status state="loading" />}>
                  <KitPage />
                </Suspense>
              }
            />
          ) : null}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route element={<TeamLayout />}>
          <Route
            path="team/*"
            element={
              <Suspense fallback={<Status state="loading" />}>
                <TeamApp />
              </Suspense>
            }
          />
        </Route>
        <Route element={<AdminLayout />}>
          <Route
            path="admin/*"
            element={
              <Suspense fallback={<Status state="loading" />}>
                <AdminApp />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

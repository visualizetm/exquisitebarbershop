import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AdminLayout, PublicLayout, TeamLayout } from './Layout';
import { ChairPage } from '@/pages/ChairPage';
import { ChairsPage } from '@/pages/ChairsPage';
import { GalleryPage } from '@/pages/GalleryPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { SetupPage } from '@/pages/SetupPage';
import { VisitPage } from '@/pages/VisitPage';
import { Status } from '@/components/Status';
import { DemoNotice } from '@/components/site/DemoNotice';

// The staff area is its own chunk: public visitors never download it.
const AdminApp = lazy(() => import('@/admin/AdminApp'));
// The booking flow and the manage page load on their own, so Home paints without them.
const BookPage = lazy(() => import('@/pages/BookPage').then((m) => ({ default: m.BookPage })));
const ManagePage = lazy(() =>
  import('@/pages/ManagePage').then((m) => ({ default: m.ManagePage })),
);
// The barber portal is another chunk of its own, for the same reason.
const TeamApp = lazy(() => import('@/team/TeamApp'));
const KioskPage = lazy(() => import('@/checkin/KioskPage').then((m) => ({ default: m.KioskPage })));
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
          <Route
            path="book"
            element={
              <Suspense fallback={<Status state="loading" />}>
                <BookPage />
              </Suspense>
            }
          />
          <Route
            path="manage"
            element={
              <Suspense fallback={<Status state="loading" />}>
                <ManagePage />
              </Suspense>
            }
          />
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
          {/* The locked front desk tablet: no nav, no footer, no links, its own chunk. */}
          <Route
            path="checkin"
            element={
              <Suspense fallback={<Status state="loading" />}>
                <KioskPage />
              </Suspense>
            }
          />
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

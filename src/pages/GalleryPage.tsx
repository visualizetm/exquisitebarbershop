import { usePageTitle } from '@/lib/usePageTitle';

export function GalleryPage() {
  usePageTitle('Gallery');
  return (
    <article className="exq-gallery" data-state="empty">
      <h1 className="exq-gallery__title">Gallery</h1>
      <p className="exq-gallery__empty">
        Photos are coming soon. Follow @exquisitebarberbeauty for the latest work.
      </p>
    </article>
  );
}

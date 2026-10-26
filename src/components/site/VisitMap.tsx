import { useState } from 'react';
import type { PublicShop } from '@shared/api/public';
import { mapEmbedUrl } from '@/lib/shop';

/**
 * The map under the address: Google's embed from the shop's name and address, no key. It lazy
 * loads in a fixed 4:3 (16:9 from 768px) frame, so nothing shifts. On a phone the map starts
 * covered by a tap-to-explore layer, so a finger moving over it scrolls the page rather than the
 * map; one tap hands the map the touch. The Directions link under it works whether or not the
 * frame loads.
 */
export function VisitMap({ shop }: { shop: Pick<PublicShop, 'address' | 'name'> }) {
  const [active, setActive] = useState(false);
  return (
    <div className="exq-visit__map" data-state={active ? 'active' : 'idle'}>
      <iframe
        className="exq-visit__map-frame"
        src={mapEmbedUrl(shop)}
        title={`Map to ${shop.name}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      {active ? null : (
        <button
          type="button"
          className="exq-visit__map-cover"
          onClick={() => {
            setActive(true);
          }}
        >
          <span className="exq-visit__map-hint">Tap to move the map</span>
        </button>
      )}
    </div>
  );
}

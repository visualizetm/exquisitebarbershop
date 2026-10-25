import {
  staffMutationResponseSchema,
  type AdminServiceView,
  type AdminStaffView,
} from '@shared/api/admin';
import { useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { PriceOverrideEditor } from './PriceOverrideEditor';

/** The Prices tab of a barber: their own prices and times for the services they do. Owner only. */
export function PricesTab({
  member,
  services,
  onChanged,
  onChooseServices,
}: {
  member: AdminStaffView;
  /** The shop's live services; the editor lists the ones this barber offers. */
  services: AdminServiceView[];
  onChanged: () => void;
  onChooseServices: () => void;
}) {
  const toast = useToast();
  return (
    <div className="exq-tabbody">
      <PriceOverrideEditor
        // A new key after a save gives the editor the stored list as its starting point.
        key={JSON.stringify([member.serviceIds, member.servicePrices])}
        staffName={member.name}
        services={services.filter((s) => member.serviceIds.includes(s.id))}
        saved={member.servicePrices}
        onChooseServices={onChooseServices}
        onSave={async (entries) => {
          await apiRequest(`/api/admin/staff/${member.id}`, staffMutationResponseSchema, {
            method: 'PATCH',
            body: { servicePrices: entries },
          });
          onChanged();
          toast({
            text: 'Prices saved. The site and booking use them right away. Bookings already made keep their price.',
            tone: 'ok',
          });
        }}
      />
    </div>
  );
}

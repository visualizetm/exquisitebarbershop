import type { ConflictResolution } from '@shared/api/admin';
import { Resolver } from '../panels/Resolver';
import type { AffectedBooking } from '../useConflictAction';

/**
 * The resolver for the settings screens. It is the same component the side panels use, so Move,
 * Keep, Cancel and Cancel and notify look and work the same everywhere.
 */
export function ConflictResolver({
  affected,
  keepOnly = false,
  working,
  onSubmit,
  onCancel,
}: {
  affected: AffectedBooking[];
  keepOnly?: boolean;
  working: boolean;
  onSubmit: (resolutions: ConflictResolution[]) => void;
  onCancel: () => void;
}) {
  return (
    <Resolver
      affected={affected}
      keepOnly={keepOnly}
      working={working}
      onSubmit={onSubmit}
      onBack={onCancel}
    />
  );
}

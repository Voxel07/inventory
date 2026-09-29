import { PurchasingPanel } from '../operations/PurchasingOperations';
import type { ProcurementDeficit } from '../../services/procurementService';

export function ProcurementOrders(props: { selected: ProcurementDeficit | null; eventId: string; onClose: () => void }) {
  return <PurchasingPanel {...props} />;
}

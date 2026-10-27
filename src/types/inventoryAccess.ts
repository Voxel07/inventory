export interface InventoryGrant { userId?: string | null; groupId?: string | null; canEdit: boolean; name?: string }
/** A share that reaches a resource through a private location it is stored in. */
interface InheritedShare {
  locationId: string; locationName: string; kind: 'owner' | 'person' | 'group';
  principalId: string; name: string; canEdit: boolean;
}
export interface InventoryAccess {
  privateResource: boolean; ownerId?: string; ownerName?: string; revision: number;
  canEdit: boolean; canManage: boolean;
  /** Items only: publicly available for organization orders, while ownership/editing stay private. */
  publicUse?: boolean;
  grants: InventoryGrant[];
  /** Listed for managers only, like `grants`. */
  inherited?: InheritedShare[];
  sources: { kind: 'owner' | 'admin' | 'person' | 'group' | 'location' | 'public_use'; principalId: string; name: string; canEdit: boolean }[];
  audience: { kind: 'owner' | 'person' | 'group'; principalId: string; name: string; canEdit: boolean }[];
}
export interface AccessPerson { id: string; name: string }
/** `ownerId` null: managed by the inventory admin. Members see their group's membership. */
export interface AccessGroup {
  id: string; name: string; revision: number; memberIds: string[];
  members: AccessPerson[];
  ownerId?: string | null; ownerName?: string | null; canManage?: boolean;
}

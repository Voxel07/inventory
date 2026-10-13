export interface InventoryGrant { userId?: string | null; groupId?: string | null; canEdit: boolean }
/** A share that reaches a resource through a private location it is stored in. */
export interface InheritedShare {
  locationId: string; locationName: string; kind: 'owner' | 'person' | 'group';
  principalId: string; name: string; canEdit: boolean;
}
export interface InventoryAccess {
  privateResource: boolean; ownerId?: string; ownerName?: string; revision: number;
  canEdit: boolean; canManage: boolean;
  /** Items only: the owner offers it for use; organization members may view and request it. */
  publicUse?: boolean;
  grants: InventoryGrant[];
  /** Listed for managers only, like `grants`. */
  inherited?: InheritedShare[];
  sources: { kind: 'owner' | 'admin' | 'person' | 'group' | 'location' | 'public_use'; principalId: string; name: string; canEdit: boolean }[];
}
export interface AccessPerson { id: string; name: string }
/** `ownerId` null: managed by the inventory admin. Members are listed for managers only. */
export interface AccessGroup {
  id: string; name: string; revision: number; memberIds: string[];
  ownerId?: string | null; ownerName?: string | null; canManage?: boolean;
}

export interface InventoryGrant { userId?: string | null; groupId?: string | null; canEdit: boolean }
export interface InventoryAccess {
  privateResource: boolean; ownerId?: string; ownerName?: string; revision: number;
  canEdit: boolean; canManage: boolean; grants: InventoryGrant[];
  sources: { kind: 'owner' | 'admin' | 'person' | 'group'; principalId: string; name: string; canEdit: boolean }[];
}
export interface AccessPerson { id: string; name: string }
export interface AccessGroup { id: string; name: string; revision: number; memberIds: string[] }

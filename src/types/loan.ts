export interface Loan { id: string; itemId: string; item: string; commitmentId: string; providerLocationId: string; provider: string; contact: string; terms: string; kind: string; quantity: number; collected: number; returned: number; assetCodes: string[]; collectionDate: number; availableUntil: number; returnDue: number; status: string; revision: number; history: { action: string; at: number; actor: string; notes: string }[] }
export interface LoanInput { commitmentId: string; providerLocationId: string; kind: 'borrow' | 'rental'; provider: string; contact: string; terms: string }
export interface LoanMovementInput { transferId: string; revision: number; notes: string }
export interface LoanExtensionInput { availableUntil: number; returnDue: number; revision: number; reason: string }

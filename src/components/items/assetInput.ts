import type { AssetInstance, AssetInstanceInput } from '../../types';

/** Editable asset information; condition, location and custody change through their own commands. */
export function assetEditInput(asset: AssetInstance): AssetInstanceInput {
    return {
        assetCode: asset.assetCode, serialNumber: asset.serialNumber ?? '', manufacturer: asset.manufacturer ?? '', model: asset.model ?? '',
        purchaseDate: asset.purchaseDate, purchasePrice: asset.purchasePrice, replacementValue: asset.replacementValue,
        operatingHours: asset.operatingHours, notes: asset.notes ?? '', expectedVersion: asset.version,
    };
}

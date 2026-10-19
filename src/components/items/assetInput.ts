import type { AssetInstance, AssetInstanceInput } from '../../types';

/**
 * Editable asset information; condition, location and custody change through their own commands.
 * The meter is only editable on items that record operating hours.
 */
export function assetEditInput(asset: AssetInstance, tracksRuntime: boolean): AssetInstanceInput {
    return {
        assetCode: asset.assetCode, serialNumber: asset.serialNumber ?? '', manufacturer: asset.manufacturer ?? '', model: asset.model ?? '',
        purchaseDate: asset.purchaseDate, purchasePrice: asset.purchasePrice, replacementValue: asset.replacementValue,
        operatingHours: tracksRuntime ? asset.operatingHours : undefined, notes: asset.notes ?? '', expectedVersion: asset.version,
    };
}

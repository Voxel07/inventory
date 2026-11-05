import type { AssemblyFormData } from '../../src/types';
import type { updateAssembly } from '../../src/services/assemblyService';
import type { useUpdateAssembly } from '../../src/hooks/useAssemblies';

// Included in the normal typecheck: widening these back to Partial must fail.
type CompleteAssembly<T extends AssemblyFormData> = T;
export type AssemblyServiceUpdateContract = CompleteAssembly<Parameters<typeof updateAssembly>[1]>;
export type AssemblyHookUpdateContract = CompleteAssembly<Parameters<ReturnType<typeof useUpdateAssembly>['mutate']>[0]['data']>;

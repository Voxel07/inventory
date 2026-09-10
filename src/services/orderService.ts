import type { GeneralOrder, GeneralOrderFormData } from '../types';
import { createCreateResourceApi } from './resourceFactory';

export const generalOrderApi = createCreateResourceApi<GeneralOrder, GeneralOrderFormData>('/api/general-orders');
export const getOrders = generalOrderApi.getAll;
export const createOrder = generalOrderApi.create;

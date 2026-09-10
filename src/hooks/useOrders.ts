import type { GeneralOrder, GeneralOrderFormData } from '../types';
import { generalOrderApi } from '../services/orderService';
import { createCreateResourceHooks } from './useResourceApi';

export const {
  useList: useOrders,
  useCreate: useCreateOrder,
} = createCreateResourceHooks<GeneralOrder, GeneralOrderFormData>(generalOrderApi, 'general-orders');

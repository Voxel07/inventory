import type { ItemFormData } from '../types';

export function validateItemForm(data: ItemFormData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.name.trim()) {
    errors.name = 'Name is required';
  }
  if (data.amount < 0) {
    errors.amount = 'Amount cannot be negative';
  }

  return errors;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

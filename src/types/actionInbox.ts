export interface InboxAction { key: string; kind: string; title: string; detail?: string; due?: number; path: string; remindAt?: number }
export interface ReminderInput { key: string; remindAt: number | null }

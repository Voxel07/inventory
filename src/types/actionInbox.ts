export interface InboxAction { key: string; kind: string; title: string; detail?: string; due?: string; path: string; remindAt?: string }
export interface ReminderInput { key: string; remindAt: string | null }

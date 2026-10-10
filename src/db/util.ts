import { randomUUID } from 'expo-crypto';

export const newId = () => randomUUID();

export const nowIso = () => new Date().toISOString();

/** Colours handed out to new family members and categories. */
export const PALETTE = ['#2563EB', '#DB2777', '#16A34A', '#EA580C', '#7C3AED', '#0891B2', '#CA8A04', '#DC2626', '#4F46E5', '#059669'];

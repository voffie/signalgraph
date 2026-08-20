import type { Status } from './types';

// ─── Design tokens ────────────────────────────────────────────────────────────

export const BG = '#050508';                      // page chrome
export const SURFACE = '#08080f';                      // graph canvas — distinct from panels
export const PANEL = '#0c0c18';                      // sidebar / header / inspector
export const CARD = '#111126';                      // elevated card surfaces
export const BORDER_HI = 'rgba(255,255,255,0.10)';       // panel-level borders
export const BORDER = 'rgba(255,255,255,0.055)';      // inner / subtle borders
export const ACCENT = '#7c6fe0';                      // violet — handlers / primary
export const MSG_C = '#4f8ef7';                      // blue — events / messages
export const TEXT = '#e2e2ee';
export const TEXT2 = '#8080a0';
export const MUTED = '#3d3d58';

// ─── Visual constants ─────────────────────────────────────────────────────────

export const NW = 172;
export const NH = 76;

export const SC: Record<Status, string> = { ok: '#22c55e', warning: '#f59e0b', error: '#ef4444' };
export const SL: Record<Status, string> = { ok: 'Healthy', warning: 'Degraded', error: 'Failed' }

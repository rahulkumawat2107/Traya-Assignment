export const colors = {
  background: '#F4F5F7',
  card: '#FFFFFF',
  text: '#14181F',
  muted: '#667085',
  border: '#E4E7EC',
  primary: '#2563EB',
  primaryText: '#FFFFFF',
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#92400E',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  info: '#1E40AF',
  infoBg: '#DBEAFE',
  track: '#E4E7EC',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

export const typography = {
  title: { fontSize: 20, fontWeight: '700' },
  heading: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
  value: { fontSize: 30, fontWeight: '700' },
} as const;

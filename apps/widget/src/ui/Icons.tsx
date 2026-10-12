import type { JSX } from 'preact';

type P = JSX.SVGAttributes<SVGSVGElement>;

const base = (props: P) => ({
  width: 20, height: 20, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  ...props,
});

export const IconChat = (p: P) => (<svg {...base(p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
export const IconClose = (p: P) => (<svg {...base(p)}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
export const IconMinimize = (p: P) => (<svg {...base(p)}><line x1="5" y1="12" x2="19" y2="12" /></svg>);
export const IconBack = (p: P) => (<svg {...base(p)}><polyline points="15 18 9 12 15 6" /></svg>);
export const IconSend = (p: P) => (<svg {...base(p)}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
export const IconReply = (p: P) => (<svg {...base(p)}><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>);
export const IconTrash = (p: P) => (<svg {...base(p)}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>);
export const IconAttach = (p: P) => (<svg {...base(p)}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49L12.95 2.56a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.49" /></svg>);
export const IconMic = (p: P) => (<svg {...base(p)}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>);
export const IconStop = (p: P) => (<svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>);
export const IconPhone = (p: P) => (<svg {...base(p)}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.9.36 1.79.7 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.27a2 2 0 0 1 2.11-.45c.84.34 1.73.57 2.63.7a2 2 0 0 1 1.72 2.03z" /></svg>);
export const IconVideo = (p: P) => (<svg {...base(p)}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>);
export const IconPhoneOff = (p: P) => (<svg {...base(p)}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
export const IconMicOff = (p: P) => (<svg {...base(p)}><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><path d="M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>);
export const IconScreen = (p: P) => (<svg {...base(p)}><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>);
export const IconSearch = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
export const IconPlus = (p: P) => (<svg {...base(p)}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
export const IconUsers = (p: P) => (<svg {...base(p)}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
export const IconCheck = (p: P) => (<svg {...base(p)}><polyline points="20 6 9 17 4 12" /></svg>);
export const IconEdit = (p: P) => (<svg {...base(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>);
export const IconInfo = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>);
export const IconLock = (p: P) => (<svg {...base(p)}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
export const IconEye = (p: P) => (<svg {...base(p)}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);

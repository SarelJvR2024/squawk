import type { SVGProps } from "react";

const s = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  width: 16,
  height: 16,
  ...p,
});

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
export const IconDash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <rect x="4" y="11" width="16" height="2.2" rx="1.1" fill="currentColor" />
  </svg>
);
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.4V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
export const IconMic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
export const IconFlag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M5 21V4M5 4h12l-2.5 3.5L17 11H5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
export const IconLoop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M3.5 12a8.5 8.5 0 0114.5-6M20.5 12a8.5 8.5 0 01-14.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M18 2.5V6h-3.5M6 21.5V18h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconGrid = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <rect x="3" y="3" width="7" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    <rect x="14" y="3" width="7" height="5" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    <rect x="14" y="12" width="7" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    <rect x="3" y="16" width="7" height="5" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
export const IconClipboard = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.8" />
    <rect x="9" y="3" width="6" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9.2 12.4l2 2 3.6-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 11v5.4M12 7.8v.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
export const IconLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconInbox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M3 13h5l1.5 3h5l1.5-3h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.5 4h13l2.5 9v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6l2.5-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);
export const IconHelp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9.8 9.4a2.2 2.2 0 114 1.2c-.6.7-1.8 1-1.8 2.2M12 16.4v.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
/** Bringing another auditor's captures in: an arrow going INTO a tray, the
 *  mirror of IconDownload, so the pair reads as out and in. */
export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M12 15V3m0 0L8 7m4-4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
/** Pre-flight: a dial with a needle. Not the help question-mark, which is
 *  already the shortcut sheet — two destinations wearing one icon is two things
 *  to get wrong on a bar you are reading one-handed. */
export const IconGauge = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M4 17a8 8 0 1116 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M12 17l4.2-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1.3" fill="currentColor" />
  </svg>
);
/** Two auditors, one audit. */
export const IconTeam = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M3.5 19a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M16 5.6a3.2 3.2 0 010 4.8M17.5 14.4A5.5 5.5 0 0120.5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
/* The record copy. A cloud with an up-arrow rather than a tick, because the
   state it usually shows is "not there yet". */
/** Sync to the portal: a cloud with the arrow going UP, so it cannot be
 *  mistaken for the download beside it. */
export const IconCloudUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path
      d="M7 18h10a4 4 0 000-8 6 6 0 00-11.5-1.5A3.5 3.5 0 006 18h1z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M12 21v-7m0 0l-2.5 2.5M12 14l2.5 2.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="rotate(180 12 17.5)"
    />
  </svg>
);

export const IconCloud = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path
      d="M7 18h10a4 4 0 000-8 6 6 0 00-11.5-1.5A3.5 3.5 0 006 18h1z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M12 20v-7m0 0l-2.5 2.5M12 13l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Composer — deterministic, offline. Distinct from the AI spark on purpose:
   an auditor should be able to tell at a glance which button needs a network. */
export const IconWand = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M4 20L15 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M14.2 4.6l1.1 2.3 2.3 1.1-2.3 1.1-1.1 2.3-1.1-2.3L10.8 8l2.3-1.1 1.1-2.3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M19.4 13.2l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6.6-1.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);
export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M18.5 16.5l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

/** Three dots. The universal "there is more here", and the only thing on the
 *  masthead that has to be understood without a label at 390px. */
export const IconMore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...s(p)}>
    <circle cx="5.5" cy="12" r="1.9" fill="currentColor" />
    <circle cx="12" cy="12" r="1.9" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.9" fill="currentColor" />
  </svg>
);

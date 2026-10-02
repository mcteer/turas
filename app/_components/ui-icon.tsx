import type { ReactNode } from "react";

const paths = {
  customers: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 10h3a1 1 0 0 1 1 1v10M2 21h20M8 7h4M8 11h4M8 15h4M9 21v-3h2v3" /></>,
  knowledge: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15" /></>,
  operations: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 9v12M13 13h4M13 17h4" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" /></>,
  upload: <><path d="M12 16V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></>,
  finance: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 15h3M14 15h3" /></>,
  access: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-5" /></>,
  plan: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  theme: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
} satisfies Record<string, ReactNode>;

export type UiIconName = keyof typeof paths;

export function UiIcon({ name, size = 18 }: { name: UiIconName; size?: number }) {
  return <svg className="ui-icon" aria-hidden="true" width={size} height={size}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M12 6v14M7 11h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </span>;
}

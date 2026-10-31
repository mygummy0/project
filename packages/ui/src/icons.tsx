import type { ReactNode, SVGProps } from "react";

function Svg({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}
export const IconFiles = () => <Svg><path d="M3 2.5h6l3 3v8H3z" /><path d="M9 2.5v3h3" /></Svg>;
export const IconSearch = () => <Svg><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" /></Svg>;
export const IconFile = () => <Svg><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></Svg>;
export const IconFolder = () => <Svg><path d="M2 4.5h4l1.2 1.5H14v7H2z" /></Svg>;
export const IconFolderOpen = () => <Svg><path d="M2 4.5h4l1.2 1.5H13v1.5M2 13l1.6-5.5H14.5L13 13z" /></Svg>;
export const IconPlus = () => <Svg><path d="M8 3v10M3 8h10" /></Svg>;
export const IconFolderPlus = () => <Svg><path d="M2 4.5h4l1.2 1.5H14v7H2zM8 8v3M6.5 9.5h3" /></Svg>;
export const IconClose = () => <Svg><path d="m4 4 8 8M12 4l-8 8" /></Svg>;
export const IconPlay = () => <Svg fill="currentColor"><path d="M4.5 3v10l8-5z" /></Svg>;
export const IconStop = () => <Svg fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1" /></Svg>;
export const IconRestart = () => <Svg><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" /></Svg>;
export const IconRefresh = () => <Svg><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" /></Svg>;
export const IconSun = () => <Svg><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></Svg>;
export const IconMoon = () => <Svg><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" /></Svg>;
export const IconPencil = () => <Svg><path d="m3 13 .6-2.7 7-7 2.1 2.1-7 7zM9.8 4.2l2 2" /></Svg>;
export const IconTrash = () => <Svg><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></Svg>;
export const IconChevron = ({ open }: { open: boolean }) => <Svg style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .1s" }}><path d="m6 4 4 4-4 4" /></Svg>;
export const IconPanel = () => <Svg><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 10h12" /></Svg>;
export const IconPreview = () => <Svg><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M10 3v10" /></Svg>;
export const IconSidebar = () => <Svg><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M6 3v10" /></Svg>;
export const IconDesktop = () => <Svg><rect x="2" y="3" width="12" height="8" rx="1" /><path d="M6 14h4M8 11v3" /></Svg>;
export const IconTablet = () => <Svg><rect x="3.5" y="2" width="9" height="12" rx="1.2" /><path d="M7 12h2" /></Svg>;
export const IconPhone = () => <Svg><rect x="5" y="2" width="6" height="12" rx="1.2" /><path d="M7.4 12h1.2" /></Svg>;
export const IconWarn = () => <Svg><path d="M8 2.5 14 13H2z" /><path d="M8 6.5v3M8 11.2v.1" /></Svg>;
export const IconError = () => <Svg><circle cx="8" cy="8" r="5.5" /><path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" /></Svg>;
export const IconInfo = () => <Svg><circle cx="8" cy="8" r="5.5" /><path d="M8 7.2V11M8 5v.1" /></Svg>;
export const IconGear = () => <Svg><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" /></Svg>;

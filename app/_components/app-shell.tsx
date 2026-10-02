"use client";

import type { StaffingNavigation } from "../../lib/server/staffing/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { MobileNavigation } from "./mobile-navigation";
import { ThemeToggle } from "./theme-provider";
import { SignOutButton } from "../(workspace)/sign-out-button";

function SidebarContent({ role, loginName, csrfToken, staffing }: { role: string; loginName: string; csrfToken: string; staffing: StaffingNavigation }) {
  const pathname = usePathname();
  const current = (href: string) => pathname === href ? "page" as const : undefined;
  return <>
    <Link className="brand" href="/s">Turas</Link>
    <a className="nav-action" href="/s"><span aria-hidden="true">＋</span> New chat</a>
    <ConversationList navigation={<nav className="workspace-nav" aria-label="Workspace">
      <Link className="nav-link" aria-current={current("/customers")} href="/customers">Customer profiles</Link>
      <Link className="nav-link" aria-current={current("/knowledge")} href="/knowledge">Shared knowledge</Link>
      {staffing.resources && <Link className="nav-link" href="/staffing">Staffing operations</Link>}
      {staffing.resources && <Link className="nav-link" href="/staffing/resources">Resources and skills</Link>}
      {staffing.imports && <Link className="nav-link" href="/staffing/imports">Workforce imports</Link>}
      {staffing.finance && <Link className="nav-link" href="/staffing/finance">Planning finance</Link>}
      {role === "admin" && <Link className="nav-link" href="/admin/access">Access</Link>}
    </nav>} />
    <div className="nav-bottom"><div>Signed in as <strong>{loginName}</strong> <span className="muted">· {role}</span></div>
      <ThemeToggle /><div><SignOutButton csrfToken={csrfToken} /></div></div>
  </>;
}

export function AppShell({ children, role, loginName, csrfToken, staffing }: {
  children: React.ReactNode; role: string; loginName: string; csrfToken: string; staffing: StaffingNavigation;
}) {
  const content = <SidebarContent staffing={staffing} role={role} loginName={loginName} csrfToken={csrfToken} />;
  return <div className="workspace">
    <aside className="desktop-sidebar"><div className="sidebar">{content}</div></aside>
    <MobileNavigation><SidebarContent staffing={staffing} role={role} loginName={loginName} csrfToken={csrfToken} /></MobileNavigation>
    <div className="workspace-main">{children}</div>
  </div>;
}

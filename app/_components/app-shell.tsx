"use client";

import type { StaffingNavigation } from "../../lib/server/staffing/navigation";
import Link from "next/link";
import { ConversationList } from "./conversation-list";
import { MobileNavigation } from "./mobile-navigation";
import { ThemeToggle } from "./theme-provider";
import { SignOutButton } from "../(workspace)/sign-out-button";

function SidebarContent({ role, loginName, csrfToken, staffing }: { role: string; loginName: string; csrfToken: string; staffing: StaffingNavigation }) {
  return <>
    <Link className="brand" href="/s">Turas</Link>
    <Link className="nav-action" href="/s">＋ New chat</Link>
    <nav aria-label="Workspace">
      <Link className="nav-link" href="/customers">Customer profiles</Link>
      <Link className="nav-link" href="/knowledge">Shared knowledge</Link>
      {staffing.resources && <Link className="nav-link" href="/staffing">Staffing operations</Link>}
      {staffing.resources && <Link className="nav-link" href="/staffing/resources">Resources and skills</Link>}
      {staffing.imports && <Link className="nav-link" href="/staffing/imports">Workforce imports</Link>}
      {staffing.finance && <Link className="nav-link" href="/staffing/finance">Planning finance</Link>}
      {role === "admin" && <Link className="nav-link" href="/admin/access">Access</Link>}
    </nav>
    <ConversationList />
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

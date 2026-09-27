"use client";

import Link from "next/link";
import { ConversationList } from "./conversation-list";
import { MobileNavigation } from "./mobile-navigation";
import { ThemeToggle } from "./theme-provider";
import { SignOutButton } from "../(workspace)/sign-out-button";

function SidebarContent({ role, loginName, csrfToken }: { role: string; loginName: string; csrfToken: string }) {
  return <>
    <Link className="brand" href="/s">Turas</Link>
    <Link className="nav-action" href="/s">＋ New chat</Link>
    <nav aria-label="Workspace">
      <Link className="nav-link" href="/customers">Customer profiles</Link>
      {role === "admin" && <Link className="nav-link" href="/admin/access">Access</Link>}
    </nav>
    <ConversationList />
    <div className="nav-bottom"><div>Signed in as <strong>{loginName}</strong> <span className="muted">· {role}</span></div>
      <ThemeToggle /><div><SignOutButton csrfToken={csrfToken} /></div></div>
  </>;
}

export function AppShell({ children, role, loginName, csrfToken }: {
  children: React.ReactNode; role: string; loginName: string; csrfToken: string;
}) {
  const content = <SidebarContent role={role} loginName={loginName} csrfToken={csrfToken} />;
  return <div className="workspace">
    <aside className="desktop-sidebar"><div className="sidebar">{content}</div></aside>
    <MobileNavigation><SidebarContent role={role} loginName={loginName} csrfToken={csrfToken} /></MobileNavigation>
    <div className="workspace-main">{children}</div>
  </div>;
}

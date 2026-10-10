"use client";

import type { StaffingNavigation } from "../../lib/server/staffing/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { MobileNavigation } from "./mobile-navigation";
import { ThemeToggle } from "./theme-provider";
import { SignOutButton } from "../(workspace)/sign-out-button";
import { BrandMark, UiIcon, type UiIconName } from "./ui-icon";

function SidebarContent({ role, loginName, csrfToken, staffing, kind }: { role: string; loginName: string; csrfToken: string; staffing: StaffingNavigation; kind: string }) {
  const pathname = usePathname();
  const customerScope = pathname.match(/^\/customers\/([a-f0-9-]{36})(?:\/|$)/)?.[1];
  const current = (href: string) => (pathname === href || (href !== "/staffing" && pathname.startsWith(`${href}/`))) ? "page" as const : undefined;
  const navItem = (href: string, label: string, icon: UiIconName) =>
    <Link className="nav-link" aria-current={current(href)} href={href}><UiIcon name={icon} /><span>{label}</span></Link>;
  return <>
    <Link className="brand" href="/s"><BrandMark />Turas</Link>
    <a className="nav-action" href="/s"><UiIcon name="plus" /> New Chat</a>
    <ConversationList csrfToken={csrfToken} navigation={<nav className="workspace-nav" aria-label="Workspace">
      <p className="nav-group-label">Workspace</p>
      {navItem("/customers", "Customer Profiles", "customers")}
      {navItem("/knowledge", "Shared Knowledge", "knowledge")}
      {navItem('/learning','Learning','knowledge')}
      {navItem("/partners", "Partner Delivery", "people")}
      {kind === "internal" && navItem("/product-gaps", "Product Gaps", "plan")}
      {customerScope && <><p className="nav-group-label">Current Customer</p>{navItem(`/customers/${customerScope}/reports`, "Customer Reports", "plan")}</>}
      {staffing.resources && <p className="nav-group-label">Delivery</p>}
      {staffing.resources && navItem("/staffing", "Staffing Operations", "operations")}
      {staffing.resources && navItem("/staffing/resources", "Resources and Skills", "people")}
      {staffing.imports && navItem("/staffing/imports", "Workforce Imports", "upload")}
      {staffing.finance && navItem("/staffing/finance", "Planning Finance", "finance")}
      {role === "admin" && <><p className="nav-group-label">Administration</p>{navItem("/admin/access", "Access", "access")}</>}
    </nav>} />
    <div className="nav-bottom">
      <div className="nav-identity"><span className="account-avatar" aria-hidden="true">{loginName.slice(0, 1).toUpperCase()}</span>
        <div><strong><span className="sr-only">Signed in as </span>{loginName}</strong><span className="muted">{role}</span></div></div>
      <div className="nav-utilities"><ThemeToggle /><SignOutButton csrfToken={csrfToken} /></div>
    </div>
  </>;
}

export function AppShell({ children, role, loginName, csrfToken, staffing, kind }: {
  children: React.ReactNode; role: string; loginName: string; csrfToken: string; staffing: StaffingNavigation; kind: string;
}) {
  const content = <SidebarContent kind={kind} staffing={staffing} role={role} loginName={loginName} csrfToken={csrfToken} />;
  return <div className="workspace">
    <aside className="desktop-sidebar"><div className="sidebar">{content}</div></aside>
    <MobileNavigation><SidebarContent kind={kind} staffing={staffing} role={role} loginName={loginName} csrfToken={csrfToken} /></MobileNavigation>
    <div className="workspace-main">{children}</div>
  </div>;
}

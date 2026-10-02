import { UiIcon, type UiIconName } from "./ui-icon";

export function EmptyState({ icon, title, children }: {
  icon: UiIconName; title: string; children?: React.ReactNode;
}) {
  return <div className="empty-state">
    <span className="empty-state-icon"><UiIcon name={icon} size={22} /></span>
    <div><p className="empty-state-title">{title}</p>{children && <p className="empty-state-description">{children}</p>}</div>
  </div>;
}

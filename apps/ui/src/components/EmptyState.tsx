import type { ReactNode } from 'react';

interface Props {
  icon?: string;
  title: string;
  text?: string;
  children?: ReactNode;
}

export function EmptyState({ icon, title, text, children }: Props) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-title">{title}</div>
      {text && <div className="empty-state-text">{text}</div>}
      {children}
    </div>
  );
}

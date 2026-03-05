import { Link } from 'react-router-dom';

interface Props {
  to: string;
  icon: string;
  title: string;
  description: string;
}

export function QuickActionCard({ to, icon, title, description }: Props) {
  return (
    <Link to={to} className="quick-action-card">
      <div className="quick-action-icon">{icon}</div>
      <div>
        <div className="quick-action-title">{title}</div>
        <div className="quick-action-desc">{description}</div>
      </div>
    </Link>
  );
}

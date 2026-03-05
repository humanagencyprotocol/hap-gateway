import type { ReactNode } from 'react';

interface Props {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function SelectionCard({ selected, onClick, children, className = '', style }: Props) {
  return (
    <div
      className={`selection-card${selected ? ' selected' : ''} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

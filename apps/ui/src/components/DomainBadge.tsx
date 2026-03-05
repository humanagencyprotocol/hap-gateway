interface Props {
  domain: string;
  attested?: boolean;
}

export function DomainBadge({ domain, attested }: Props) {
  const cls = attested === true ? 'domain-attested' : attested === false ? 'domain-missing' : '';
  return (
    <span className={`domain-badge ${cls}`} style={{ fontSize: '0.75rem' }}>
      {domain}
    </span>
  );
}

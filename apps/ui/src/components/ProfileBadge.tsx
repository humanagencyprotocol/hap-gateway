interface Props {
  profileId: string;
}

export function ProfileBadge({ profileId }: Props) {
  return <span className="profile-badge">{profileId}</span>;
}

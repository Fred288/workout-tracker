import { Link } from 'react-router-dom';
import PageTitle from '../components/PageTitle';

export default function Profile() {
  return (
    <>
      <PageTitle>Profil</PageTitle>
      <Link
        to="/settings"
        className="flex min-h-11 items-center rounded-lg border border-border bg-surface px-4"
      >
        Einstellungen und Backup
      </Link>
      <p className="mt-4 text-sm text-neutral-500">
        Version {__APP_VERSION__} ({__APP_BUILD__})
      </p>
    </>
  );
}

import PageTitle from '../components/PageTitle';

export default function Profile() {
  return (
    <>
      <PageTitle>Profil</PageTitle>
      <p className="text-sm text-neutral-500">Version {__APP_VERSION__}</p>
    </>
  );
}

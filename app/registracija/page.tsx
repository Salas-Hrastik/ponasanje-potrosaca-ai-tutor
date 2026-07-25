import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Registracija' };

export default function RegistracijaPage() {
  return (
    <div className="page page-auth">
      <AuthForm mode="registracija" />
    </div>
  );
}

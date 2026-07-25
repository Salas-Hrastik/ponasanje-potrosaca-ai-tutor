import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Prijava' };

export default function PrijavaPage() {
  return (
    <div className="page page-auth">
      <AuthForm mode="prijava" />
    </div>
  );
}

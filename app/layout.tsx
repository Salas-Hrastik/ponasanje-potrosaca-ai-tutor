import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: config.siteName,
  description:
    'Samostalni obrazovni AI asistent za kolegij Ponašanje potrošača u turizmu — odgovara isključivo prema veleučilišnom priručniku, uz citiranje poglavlja i stranice.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body>
        <Header />
        <main className="glavni-sadrzaj">{children}</main>
        <footer className="podnozje">
          <span>
            {config.ustanova} · {config.studij}
          </span>
          <span className="podnozje-napomena">
            Asistent odgovara isključivo prema priručniku kolegija i uvijek navodi stranicu.
          </span>
        </footer>
      </body>
    </html>
  );
}

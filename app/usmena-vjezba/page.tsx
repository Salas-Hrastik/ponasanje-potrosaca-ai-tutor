import Link from 'next/link';
import { getPoglavljaSaLekcijama } from '@/lib/content';
import OralPracticePicker from '@/components/OralPracticePicker';

export const dynamic = 'force-dynamic';

export default async function UsmenaVjezbaPage() {
  const poglavlja = await getPoglavljaSaLekcijama();

  return (
    <div className="page page-usmena">
      <p className="lekcija-mrvice">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>Usmena vježba</h1>
      <p className="usmena-uvod">
        Vježba za usmeni ispit <strong>bez službenog ocjenjivanja</strong>. Asistent postavlja jedno
        pitanje iz odabranog poglavlja, vi odgovarate glasom (ili tipkanjem), potvrdite transkript i
        dobijete formativnu povratnu informaciju: što je točno, što nedostaje, što je pogrešno, uz
        savjete i idealan sažeti odgovor s citiranim stranicama priručnika.
      </p>
      <p className="usmena-privatnost">
        🔒 Snimka se ne pohranjuje — čuva se samo transkript i tehničke metrike.
      </p>

      {poglavlja.length === 0 ? (
        <p>Sadržaj kolegija još nije učitan.</p>
      ) : (
        <OralPracticePicker
          poglavlja={poglavlja.map((p) => ({ broj: p.broj, naslov: p.naslov, brojLekcija: p.lekcije.length }))}
        />
      )}
    </div>
  );
}

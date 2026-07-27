import Link from 'next/link';
import QuizRunner from '@/components/QuizRunner';

export const dynamic = 'force-dynamic';

export default function ZavrsnaProvjeraPage() {
  return (
    <div className="page page-kviz">
      <p className="mrvice-redak">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>Završna provjera znanja</h1>
      <p className="kviz-uvod">
        Reprezentativan izbor pitanja iz svakog poglavlja priručnika, uz istu kviz-mehaniku kao u
        kvizovima poglavlja. Rezultat je informativan — nije službena ocjena.
      </p>
      <QuizRunner zavrsna />
    </div>
  );
}

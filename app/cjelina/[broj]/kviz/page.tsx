import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import QuizRunner from '@/components/QuizRunner';

export const dynamic = 'force-dynamic';

export default async function KvizPage({ params }: { params: { broj: string } }) {
  const broj = Number(params.broj);
  const { data: pog } = await supabaseAdmin()
    .from('poglavlja')
    .select('id, naslov, stranica_od, stranica_do')
    .eq('broj', broj)
    .single();
  if (!pog) return notFound();

  return (
    <div className="page page-kviz">
      <p className="mrvice-redak">
        <Link href="/">← Naslovnica</Link> ·{' '}
        <Link href={`/cjelina/${broj}`}>
          {broj}. {pog.naslov}
        </Link>
      </p>
      <h1>
        Kviz — {broj}. {pog.naslov}
      </h1>
      <p className="kviz-uvod">
        Pitanja iz cijele cjeline (str. {pog.stranica_od}–{pog.stranica_do}). Jedno pitanje po
        ekranu, odgovor se provjerava odmah.
      </p>
      <QuizRunner poglavljeBroj={broj} />
    </div>
  );
}

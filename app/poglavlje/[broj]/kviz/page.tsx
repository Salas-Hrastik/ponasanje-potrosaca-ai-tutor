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
      <p className="lekcija-mrvice">
        <Link href="/">← Naslovnica</Link> · <Link href={`/poglavlje/${broj}`}>Poglavlje {broj}</Link>
      </p>
      <h1>
        Kviz — {broj}. {pog.naslov}
      </h1>
      <p className="kviz-uvod">
        Pitanja iz svih lekcija poglavlja (str. {pog.stranica_od}–{pog.stranica_do}). Jedno pitanje po
        ekranu, odgovor se provjerava odmah.
      </p>
      <QuizRunner poglavljeBroj={broj} />
    </div>
  );
}

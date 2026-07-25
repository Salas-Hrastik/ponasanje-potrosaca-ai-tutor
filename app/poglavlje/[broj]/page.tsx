import { redirect, notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';

/** Klikom na poglavlje uvijek se otvara njegova prva lekcija. */
export default async function PoglavljePage({ params }: { params: { broj: string } }) {
  const admin = supabaseAdmin();
  const { data: pog } = await admin.from('poglavlja').select('id').eq('broj', Number(params.broj)).single();
  if (!pog) return notFound();

  const { data: prva } = await admin
    .from('lekcije')
    .select('id')
    .eq('poglavlje_id', pog.id)
    .order('redoslijed')
    .limit(1)
    .maybeSingle();

  if (!prva) return notFound();
  redirect(`/lekcija/${prva.id}`);
}

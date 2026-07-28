'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Modal from './Modal';
import TtsGumb from './TtsGumb';

interface Cjelina {
  naslov: string;
  sadrzaj: string;
}

/**
 * Dijeli sažetak cjeline na odjeljke prema naslovima druge razine („## 4.4 …").
 * Tekst prije prvog odjeljka čini uvodni „Pregled".
 */
function podijeliNaCjeline(md: string): Cjelina[] {
  const cjeline: Cjelina[] = [];
  let naslov = 'Pregled';
  let redci: string[] = [];
  for (const redak of md.split('\n')) {
    if (redak.startsWith('## ') && !redak.startsWith('### ')) {
      if (redci.join('').trim()) cjeline.push({ naslov, sadrzaj: redci.join('\n') });
      naslov = redak.slice(3).trim();
      redci = [];
    } else {
      redci.push(redak);
    }
  }
  if (redci.join('').trim()) cjeline.push({ naslov, sadrzaj: redci.join('\n') });
  return cjeline;
}

/** Uklanja Markdown oznake da TTS ne čita zvjezdice i crtice. */
function zaCitanje(md: string): string {
  return md
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function SazetakModal({
  naslov,
  sazetakMd,
  stranice,
  kompaktno = false,
}: {
  naslov: string;
  sazetakMd: string;
  stranice?: string;
  /** Kompaktna varijanta: mala pilula umjesto pune trake (koristi se u traci načina rada). */
  kompaktno?: boolean;
}) {
  const [otvoren, setOtvoren] = useState(false);
  const cjeline = podijeliNaCjeline(sazetakMd);

  return (
    <>
      {kompaktno ? (
        <button className="gumb-sazetak-kompaktni" onClick={() => setOtvoren(true)}>
          📄 Sažetak cjeline
        </button>
      ) : (
        <button className="sazetak-redak" onClick={() => setOtvoren(true)}>
          <span className="sazetak-redak-naslov">📄 Sažetak cjeline</span>
          <span className="sazetak-redak-otvori">Otvori ▼</span>
        </button>
      )}

      {otvoren && (
        <Modal
          naslov={`Sažetak — ${naslov}`}
          podnaslov={stranice ? `Priručnik, str. ${stranice}` : undefined}
          onClose={() => setOtvoren(false)}
          klasa="sazetak-modal"
        >
          <TtsGumb tekst={zaCitanje(sazetakMd).slice(0, 1800)} oznaka="Poslušaj sažetak" />
          <div className="sazetak-sadrzaj">
            {cjeline.length <= 1 ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{sazetakMd}</ReactMarkdown>
            ) : (
              cjeline.map((c, i) => (
                <details key={i} className="sazetak-cjelina" open={i === 0}>
                  <summary>{c.naslov}</summary>
                  <div className="sazetak-cjelina-sadrzaj">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.sadrzaj}</ReactMarkdown>
                  </div>
                </details>
              ))
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

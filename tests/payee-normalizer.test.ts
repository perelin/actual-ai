import normalizePayee from '../src/utils/payee-normalizer';

describe('normalizePayee', () => {
  const cases: [string, string][] = [
    ['Paypal Europe S.A.R.L. Et Cie S.C.A', 'paypal europe'],
    ['Klarna Bank Ab', 'klarna bank ab'],
    ['Klarna Bank Ab (Publ) (DE61 XXX 5519)', 'klarna bank ab (publ)'],
    ['Amazon Payments Europe S.C.A.', 'amazon payments europe s.c.a'],
    ['Amazon Payments Europe S.C.A. (DE87 XXX 2006)', 'amazon payments europe s.c.a'],
    ['Amazon Eu S.A R.L., Niederlassung Deutschland', 'amazon eu s.a r.l., niederlassung deutschland'],
    ['Apple.Com/Bill', 'apple.com/bill'],
    ['Sumup  *Neckar Wave Fo', 'sumup *neckar wave fo'],
    ['Nexi Germany Gmbh (DE09 XXX 5340)', 'nexi germany gmbh'],
    ['Rewe Markt Gmbh (DE80 XXX 0759)', 'rewe markt gmbh'],
    ['Rewe Markt Gmbh', 'rewe markt gmbh'],
    ['Aldi Süd //Stuttgart/de', 'aldi süd'],
    ['Edeka 123456', 'edeka'],
    ['', ''],
    ['  ', ''],
    ['AUCHAN 034066/DE', 'auchan 034066/de'],
    ['REWE 12345 (DE12 XXX 3456)', 'rewe'],
    ['AUDIBLE   GMBH', 'audible gmbh'],
    ['Lidl GmbH & Co. KG 98765 //Berlin/de', 'lidl gmbh & co. kg'],
    ['S.C.A.', 's.c.a'],
    ['S.A.R.L.', 's.a.r.l'],
    ['S.A R.L.,', 's.a r.l'],
    ['Vodafone GmbH 1234 (DE99 XXX 0001)', 'vodafone gmbh'],
    ['ÄÖÜäöü Test', 'äöüäöü test'],
    ['  SPAR  ', 'spar'],
    ['Test---Payee|||', 'test---payee'],
    [
      'Paypal Europe S.A.R.L. Et Cie S.C.A                                   22-24 Boulevard Royal, 2449 Luxembourg (LU89 XXX 200E)',
      'paypal europe',
    ],
    [
      'Paypal Europe S.A.R.L. Et Cie S.C.A                                   22-24 Boulevard Royal, 2449 Luxembourg',
      'paypal europe',
    ],
    [
      'Paypal (Europe) s.A R.L. Et Cie, S.C.A. (DE88 XXX 6303)',
      'paypal europe',
    ],
    ['Müller GmbH, 69115 Heidelberg', 'müller gmbh, 69115 heidelberg'],
    ['Müller GmbH, 80331 München', 'müller gmbh, 80331 münchen'],
    ['Bäckerei Schmidt Hauptstr. 5, 10115 Berlin', 'bäckerei schmidt hauptstr. 5, 10115 berlin'],
  ];

  test.each(cases)('normalizes %j → %j', (input, expected) => {
    expect(normalizePayee(input)).toBe(expected);
  });
});

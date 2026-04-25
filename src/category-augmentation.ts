// Per-category prompt augmentation: description, examples and disambiguation
// hints injected into the LLM prompt. Categories listed with
// `excludeFromPrompt: true` exist in Actual but are NOT offered to the LLM
// (catch-all / obsolete / system categories) — the LLM is forced to skip
// instead of dumping into them.

export interface CategoryAugmentation {
  description?: string;
  examples?: string[];
  disambiguation?: string;
  excludeFromPrompt?: boolean;
}

export const categoryAugmentations: Record<string, CategoryAugmentation> = {
  'Lebensmittel/Einkaufen': {
    description: 'Wocheneinkauf der Familie — Supermarkt, Bäcker, Drogerie, Getränke, Süßigkeiten, Hygiene-/Pflegeartikel. Alles, was im typischen Wocheneinkauf landet, inklusive Drogeriewaren und Verbrauchsgegenstände des täglichen Bedarfs. Nur explizit medizinische Produkte gehören zu Apotheken/Medizin.',
    examples: ['Rewe', 'Aldi Süd', 'Alnatura', 'Bäcker Görtz', 'Kaufland', 'Müller (Drogerie)', 'dm'],
  },

  'GWS/Stadtwerke/Strom': {
    description: 'Stadtwerke und kommunale Versorgung — Strom, Gas, Wasser, Abwasser, Müllgebühren. Spitzname "Gas-Wasser-Scheiße".',
    examples: ['Stadtwerke Heidelberg Energie', 'Energy Market Solutions', 'kommunale Wasser-/Müllgebühren'],
  },

  Versicherungen: {
    description: 'Sämtliche Versicherungen der Familie als monatlicher Fixkosten-Block — Lebens-, Gebäude-, Kranken-, Haftpflicht-, Rechtsschutz-, KFZ-Versicherungen.',
    examples: ['SV Gebäudeversicherung', 'Allianz', 'Barmer Krankenversicherung', 'Union Krankenversicherung', 'Advigon Lebensversicherung', 'VHV Allgemeine'],
    disambiguation: 'Bausparen (LBS) gehört NICHT hierher, sondern in Savings.',
  },

  Bildung: {
    description: 'Bildungseinrichtungen für Kinder und Erwachsene — Schule, Universität, Kurse, Lehrgänge, explizit Bildungs-Material. Standard-Schulmaterial das beim Wocheneinkauf mitläuft gehört NICHT hierher.',
    examples: ['Universität Heidelberg (Semesterbeitrag)', 'Volkshochschule', 'Online-Kurse', 'Lehrbücher'],
  },

  'Steuern/Ämter/etc': {
    description: 'Behördliches und Pflichtbeiträge — Steuern, kommunale Gebühren, Rundfunkbeitrag, Bonitätsauskünfte.',
    examples: ['Stadt Heidelberg (Grundsteuer)', 'Rundfunkbeitrag ARD/ZDF', 'Schufa', 'Bundeskasse Trier', 'Finanzamt'],
  },

  'Kleidung Familie Allgemein': {
    description: 'Kleidung und Schuhe für die ganze Familie INKLUSIVE Kinderkleidung. Kinderklamotten gehören hierher (nicht in "Kinder").',
    examples: ['H+M', "Ernsting's Family", 'Schuh-Marke', 'Surf+Fashion'],
  },

  'Internet/Phones': {
    description: 'Familien-Kommunikation — Festnetz, Mobilfunk, Internet-Anschluss, sowie familien-relevante Cloud-Dienste die alle Familienmitglieder nutzen (z.B. iCloud Family, Google One Family).',
    examples: ['Telekom Deutschland', 'Vodafone', 'Congstar', 'iCloud Family', 'Google One Family'],
    disambiguation: 'Sebastians persönliche Tech/Cloud-Käufe (AWS, eigene Domains, individuelle Server) → Sebastian Hobby. Streaming-Abos für Content (Netflix, Audible) → Streaming/Abos.',
  },

  'Apotheken/Medizin': {
    description: 'Apotheke, Medikamente, medizinische Produkte. Manche ungewöhnlichen Käufe (Importe, spezielle Spritzen) müssen ggf. manuell bleiben.',
    examples: ['Kurpfalz Apotheke', 'Reischmann Apotheke', 'DocMorris', 'Online-Apotheken via PayPal'],
  },

  'Auto/Mobilität': {
    description: 'Alles rund um Auto und Mobilität — Tanken, Autowäsche, Parken, Reparaturen (auch Fahrrad), öffentliche Verkehrsmittel, Carsharing.',
    examples: ['Aral', 'Shell', 'Couche-Tard / Circle K', 'RNV (Rhein-Neckar-Verkehr)', 'Mr. Wash', 'Fahrradreparatur'],
  },

  'Bank/Finanzen': {
    description: 'Bankgebühren und steuerliche Belastungen rund ums Wertpapierdepot — was die Bank dir berechnet, nicht eine Ausgabe an einen Händler.',
    examples: ['Entgeltabschluss', 'Kontoabschluss', 'Vorabpauschale gem. § 18 InvStG (ETF-Steuer)', 'Steuerbelastung auf Wertpapierbestand'],
  },

  Savings: {
    description: 'Selbstüberweisungen aufs eigene Sparkonto/Tagesgeld + Wertpapier-/ETF-Käufe + Bausparvertrag. Auch Zahlungen an die eigene Person (eigener Name + IBAN) sind hier richtig — das sind Spar-Transfers, kein Skip.',
    examples: ['Übertrag aufs eigene Sparkonto (Sebastian Patino-Lang)', 'MSCI World ETF', 'DAX ETF', 'S&P 500 ESG ETF', 'Bitcoin ETP', 'LBS Süd (Bausparen)'],
    disambiguation: 'Selbstüberweisungen mit eigenem Namen + IBAN → hier (Sparkonto), NICHT skippen.',
  },

  'Reisen/Urlaub': {
    description: 'Reisen außerhalb von Heidelberg — Hotels, Jugendherbergen, Pensionen, Freizeitparks, Tagesausflüge. Auch lokale Spaß-/Wellenbäder mit Mini-Urlaubs-Charakter (Sandstrand, Wellen, Familien-Spaß).',
    examples: ['Novina Hotel', 'Jugendherberge', 'Playmobil Funpark', 'Calypso (Spaßbad als Mini-Urlaub)', 'Barfusspark Fehmarn', 'Restaurant am Urlaubsort'],
    disambiguation: 'Lokale, regelmäßige Schwimmbad-Besuche zum Bahnenschwimmen → Fitness/Gesundheit. Spaß-/Wellenbäder mit Kinder-Spaß-Fokus → hier (Reisen).',
  },

  'Streaming/Abos': {
    description: 'Digitale Abos für die ganze Familie — Streaming-Dienste (Audio/Video), App-Stores, Cloud-Speicher (sofern nicht Family-Plan unter Internet/Phones), Zeitschriften-Abos.',
    examples: ['Apple.com/Bill (App Store)', 'Audible', 'Amazon Prime/Media', 'Pressup (Zeitschriften)', 'Netflix', 'Spotify'],
    disambiguation: 'Sebastians persönliche Tech-Abos (AWS, Domain-Hosting, individuelle SaaS) → Sebastian Hobby.',
  },

  Bar: {
    description: 'Bargeldabhebungen am Geldautomaten und sehr kleine, nicht-zuordenbare Beträge wo der Aufwand der genauen Klassifikation den Nutzen übersteigt.',
    examples: ['Geldautomat-Buchung ("Ga Nr...")', 'kleine Sparkassen-Bargeld-Abhebung'],
  },

  'Fitness/Gesundheit': {
    description: 'Fitnessstudio, Sportverein für Erwachsene, regelmäßige lokale Schwimmbäder zum Bahnenschwimmen/Sport, Sporttherapie. Lokal & regelmäßig → hier; Ausflug → Reisen.',
    examples: ['Wellness Park Schwetzingen (Bahnenschwimmen)', 'Fit Base Heidelberg', 'SRH Campussports', 'Freizeitbad Edingen-Neckarhausen'],
  },

  'Haus/Garten/Heimwerk': {
    description: 'Baumarkt, Möbel, Garten, Heimwerker-Material, Handwerker-Rechnungen, Heizungs-/Energie-Service.',
    examples: ['Bauhaus', 'Hornbach', 'IKEA (auch via Payone)', 'Neumann Energy (Heizung)'],
  },

  'Spenden/Wohltätig': {
    description: 'Spenden an gemeinnützige Organisationen, NGOs, Hilfsorganisationen. Manche Empfänger sind nicht-offensichtlich (z.B. Signal Foundation für den Messenger — ist Spende, kein Abo).',
    examples: ['Save the Children', 'Ärzte ohne Grenzen', 'Wikimedia Deutschland', 'Netzpolitik.org', 'Signal Foundation'],
  },

  // Essen + Ausgehen wurden zusammengelegt: diese Kategorie übernimmt beides.
  'Essen (Take Away / Ausgehen)': {
    description: 'Außer-Haus-Konsum jeglicher Art: Restaurants, Take-Away, Lieferdienste, Cafés, Eisdielen, Bars, Kino, Konzerte, Museen, Bowling und ähnliche Erlebnis-/Event-Aktivitäten. Diese Kategorie wurde mit "Ausgehen (non-food)" zusammengelegt — beides gehört hierher.',
    examples: ['Ristorante Il Pescatore', 'Charisma Döner', 'Mai Wok+Grill', 'Hans im Glück', 'Kinopolis', 'SAP Arena (Konzert)', 'Hist. Museum Pfalz', 'Café/Eisdiele'],
  },

  // Wurde mit "Essen (Take Away / Ausgehen)" zusammengelegt — alte Tx bleiben in Actual,
  // dem LLM wird die Kategorie nicht mehr angeboten. Bei Gelegenheit in Actual UI
  // alle Tx nach "Essen (Take Away / Ausgehen)" verschieben und die Kategorie löschen.
  'Ausgehen (non-food)': {
    excludeFromPrompt: true,
  },

  'Petra Hobby': {
    description: 'Petras persönliche Hobby- und Freizeitausgaben — Häkeln, Stricken, Handarbeit, Bastel-/Kreativmaterial.',
    examples: ['Action Germany (Bastelmaterial, Deko)', 'Wollparadies', 'Stoff-Discounter', 'Bastel-Shops'],
    disambiguation: 'Bei Unsicherheit zwischen Petra Hobby und Sebastian Hobby → skippen statt raten. Petras Sport/Schwimmen → Fitness/Gesundheit, NICHT hier.',
  },

  'Sebastian Hobby': {
    description: 'Sebastians persönliche Hobby-Käufe — IT, Tech, Cloud-Services, Coden, KI/AI, Server, Domains, Hardware. Computer-affine Käufe via Klarna, eBay-Kleinanzeigen, Crownbill etc.',
    examples: ['Amazon Web Services', 'United-Domains', 'Crownbill', 'Klarna-Hardware-Käufe', 'eBay Kleinanzeigen (Tech)', 'individuelle Cloud-/SaaS-Abos'],
    disambiguation: 'Familien-Cloud (iCloud Family, Google One Family) → Internet/Phones. Familien-Streaming → Streaming/Abos. Bei Unsicherheit zwischen Petra Hobby und Sebastian Hobby → skippen statt raten.',
  },

  Kinder: {
    description: 'Kinder-spezifische Ausgaben — Schulkindbetreuung, Kinder-Sportvereine, Musikunterricht, Religionsunterricht/Kirche, Spielzeug, Kinderbücher. Plus Geld an/von Familienmitgliedern (Oma/Opa) speziell für die Kinder.',
    examples: ['Päd-Aktiv (Hortbetreuung)', 'SV Nikar (Schwimmverein Kinder)', 'Spielzeugladen Neusser', 'Fantastic Store (Spielzeug)', 'Römisch-Katholische Kirchengemeinde HD', 'Karin Erna Danner (Oma, für Kinder)'],
    disambiguation: 'Kinderkleidung → Kleidung Familie Allgemein. Kinderessen/-snacks → Lebensmittel.',
  },

  Income: {
    description: 'Einkommen — fast alles, was als positiver Eingang aufs Konto kommt und keine Rückbuchung ist. Gehalt, Kindergeld, Therapieerstattungen, Honorare.',
    examples: ['Paulina GmbH (Gehalt)', 'Bundesagentur für Arbeit / Familienkasse (Kindergeld)', 'Vitos Sudhessen (Petras Arbeitgeber)', 'FATZ'],
  },

  // ─── Excluded from prompt: historical / obsolete / system categories ─────
  Allgemein: {
    excludeFromPrompt: true,
  },

  UNBEKANNT: {
    excludeFromPrompt: true,
  },

  Benzin: {
    excludeFromPrompt: true,
  },

  'Starting Balances': {
    excludeFromPrompt: true,
  },
};

export interface AugmentedCategory {
  id: string;
  name: string;
  group_id?: string;
  is_income?: boolean;
  hidden?: boolean;
  description?: string;
  examples?: string[];
  disambiguation?: string;
}

export interface AugmentedCategoryGroup {
  id: string;
  name: string;
  is_income?: boolean;
  hidden?: boolean;
  groupName?: string;
  categories: AugmentedCategory[];
}

export function augmentCategoryGroups<
  TCategory extends { name: string; id: string },
  TGroup extends { categories?: TCategory[] | null },
>(groups: TGroup[]): (TGroup & { categories: (TCategory & CategoryAugmentation)[] })[] {
  return groups
    .map((group) => {
      const augmented = (group.categories ?? [])
        .map((cat) => {
          const aug = categoryAugmentations[cat.name];
          if (aug?.excludeFromPrompt) return null;
          return {
            ...cat,
            description: aug?.description,
            examples: aug?.examples,
            disambiguation: aug?.disambiguation,
          };
        })
        .filter((cat): cat is NonNullable<typeof cat> => cat !== null);
      return { ...group, categories: augmented };
    })
    .filter((group) => group.categories.length > 0);
}

const foldBrandName = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(hd|fhd|sd|full hd)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();

// Logos repérés sur les fiches CANAL+ Afrique/Congo et les pages de marques.
const CHANNEL_LOGOS: Array<{ match: RegExp; url: string }> = [
  { match: /gulli( africa)?/, url: 'https://www.cbnews.fr/sites/cbnews.fr/files/styles/panoramic_w1200/public/images/gullii-africa-253664.jpg?itok=3-C7hqqh' },
  { match: /piwi\+?/, url: 'https://cdn.tv-programme.com/photos/chaines/png_from_svg_2400/48.png' },
  { match: /teletoon\+?/, url: 'https://cdn-proxymedia-digicert.tv-fr-cdn.orange.net/api/v1/images/2324%2FATLCU065698S_COVER169-1.jpg?device=W_PC&service=replay' },
  { match: /boomerang/, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Boomerang_2014_logo.svg/1200px-Boomerang_2014_logo.svg.png' },
  { match: /tiji/, url: 'https://www.cbnews.fr/sites/cbnews.fr/files/styles/max_w800/public/2019-10/LOGO%20TIJI-2019-print-large.png?itok=Gvd1gcBj' },
  { match: /nickelodeon/, url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Nick.svg' },
  { match: /disney channel/, url: 'https://commons.wikimedia.org/wiki/Special:FilePath/2025_Disney_Channel_logo.svg' },
  { match: /canal\+ kids|canal kids/, url: 'https://thumb.canalplus.pro/http/unsafe/canalplus-cdn.canal-plus.io/p1/channel/259/canal-ouah/CHN43FN/CHN43FN_259_29082023' },
  { match: /canal\+ family|canal family/, url: 'https://images.seeklogo.com/logo-png/48/1/canal-family-logo-png_seeklogo-481271.png?v=1957933990771437312' },
  { match: /canal\+ sport 1|canal sport 1/, url: 'https://cdn.freebiesupply.com/logos/thumbs/2x/canal-sport-1-logo.png' },
  { match: /canal\+ sport 2|canal sport 2/, url: 'https://production-livingdocs-bluewin-ch.imgix.net/2022/11/15/2e0a317a-c92a-4da6-abb3-e22f871e2552.png?auto=format&w=994' },
  { match: /canal\+ cinema|canal cinema/, url: 'https://images.seeklogo.com/logo-png/48/1/canal-cinema-logo-png_seeklogo-481265.png' },
  { match: /canal\+ action|canal action/, url: 'https://thumb.canalplus.pro/http/unsafe/272x153/filters:quality(80)/canalplus-cdn.canal-plus.io/p1/list/creplay_chaine_action_selection167/canal-ouah/TITLELOGO/myCANAL_Logo_Fiche_Programme_1920x108090-LgkU' },
  { match: /canal\+ docs|canal docs/, url: 'https://thumb.canalplus.pro/http/unsafe/canalplus-cdn.canal-plus.io/p1/channel/899/canal-ouah/CHN43FN/CHN43FN_899_29082023' },
  { match: /canal\+ pop|canal pop/, url: 'https://www.canalplusadvertising.com/app/uploads/2025/06/CANAL-POP_RVB.png' },
  { match: /canal\+ premiere|canal premiere/, url: 'https://tv-programme.com/photos/episodes/86/863940/source.jpg' },
  { match: /novelas/, url: 'https://cdn.tv-programme.com/photos/chaines/png_from_svg_2400/126.png' },
  { match: /tv5 ?monde/, url: 'https://parlonsfrancais.francophonie.org/app/uploads/2022/12/tv5Afrique.jpg' },
  { match: /national geographic|nat geo/, url: 'https://d229kpbsb5jevy.cloudfront.net/teleup/content/common/logos/channel/logos/national-geographic.png' },
  { match: /planete\+?/, url: 'https://ocdn.eu/ptv2-images/logo-migrated/planete.png' },
  { match: /trace africa/, url: 'https://i1.sndcdn.com/artworks-ypXA7msR0cgQU3fU-oz3djg-t1080x1080.jpg' },
];

export const getNeahplusChannelLogo = (channelName: string): string | null => {
  const normalized = foldBrandName(channelName);
  return CHANNEL_LOGOS.find(({ match }) => match.test(normalized))?.url ?? null;
};

const CHANNEL_ORDER: Record<string, string[]> = {
  Tout: [
    'canal+ premiere', 'canal+ pop', 'canal+ cinema', 'canal+ action',
    'canal+ sport 1', 'canal+ kids', 'canal+ family', 'gulli africa',
    'piwi+', 'teletoon+', 'novelas tv', 'tv5 monde',
  ],
  'En direct': [
    'canal+ sport 1', 'canal+ sport 2', 'canal+ sport 3', 'canal+ sport 4',
    'canal+ sport 5', 'canal+ premiere', 'canal+ pop',
  ],
  Cinéma: ['canal+ cinema', 'canal+ premiere', 'canal+ action', 'action', 'rtl9', 'paramount'],
  Sport: [
    'canal+ sport 1', 'canal+ sport 2', 'canal+ sport 3', 'canal+ sport 4',
    'canal+ sport 5', 'canal+ sport', 'nba tv', 'eurosport', 'infosport+',
  ],
  Jeunesse: [
    'canal+ kids', 'gulli africa', 'piwi+', 'teletoon+', 'boomerang', 'tiji', 'nickelodeon',
    'disney channel', 'canal+ family',
  ],
  Documentaires: ['canal+ docs', 'national geographic', 'planete+', 'discovery channel', 'histoire'],
  Divertissement: ['canal+ pop', 'a+', 'novelas tv', 'tv5 monde', 'trace africa', 'nollywood'],
};

export const getNeahplusChannelPriority = (channelName: string, category: string): number => {
  const normalized = foldBrandName(channelName);
  const order = CHANNEL_ORDER[category] ?? CHANNEL_ORDER.Tout;
  const index = order.findIndex((preferred) => {
    const key = foldBrandName(preferred);
    return normalized === key || normalized.startsWith(key + ' ') || normalized.startsWith(key + '-');
  });
  return index < 0 ? order.length : index;
};

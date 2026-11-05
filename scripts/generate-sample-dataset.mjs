import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("assets/cfc-data/sample");
const channelsDir = path.join(outDir, "channels");
fs.mkdirSync(channelsDir, { recursive: true });

const generatedAt = "2026-11-05T06:00:00Z";
const schemaVersion = "1.0.0";

// Leagues
const leagues = {
  "premier-league": {
    uuid: "l-premier-league",
    slug: "premier-league",
    names: {
      en: "Premier League",
      pt: "Premier League",
      es: "Premier League",
    },
    shortNames: {
      en: "EPL",
      pt: "EPL",
    },
    logo: "https://images.cardapiofc.com/leagues/premier-league.webp",
    country: {
      code: "GB",
      names: {
        en: "United Kingdom",
        pt: "Reino Unido",
        es: "Reino Unido",
      },
    },
    popular: true,
    season: "2026-27",
    matchSlugs: [
      "arsenal-vs-chelsea-2026-11-06",
      "manchester-city-vs-arsenal-2026-11-06",
      "chelsea-vs-manchester-city-2026-11-08",
    ],
  },
  "brasileirao-serie-a": {
    uuid: "l-brasileirao-serie-a",
    slug: "brasileirao-serie-a",
    names: {
      en: "Brasileirão Série A",
      pt: "Brasileirão Série A",
      es: "Brasileirao Serie A",
    },
    shortNames: {
      en: "Série A",
      pt: "Série A",
    },
    logo: "https://images.cardapiofc.com/leagues/brasileirao-serie-a.webp",
    country: {
      code: "BR",
      names: {
        en: "Brazil",
        pt: "Brasil",
        es: "Brasil",
      },
    },
    popular: true,
    season: "2026",
    matchSlugs: [
      "flamengo-vs-palmeiras-2026-11-07",
      "sao-paulo-vs-flamengo-2026-11-08",
      "palmeiras-vs-sao-paulo-2026-11-09",
    ],
  },
  "la-liga": {
    uuid: "l-la-liga",
    slug: "la-liga",
    names: {
      en: "La Liga",
      pt: "La Liga",
      es: "La Liga",
    },
    shortNames: {
      en: "La Liga",
      pt: "La Liga",
    },
    logo: "https://images.cardapiofc.com/leagues/la-liga.webp",
    country: {
      code: "ES",
      names: {
        en: "Spain",
        pt: "Espanha",
        es: "España",
      },
    },
    popular: false,
    season: "2026-27",
    matchSlugs: [
      "real-madrid-vs-barcelona-2026-11-08",
      "barcelona-vs-real-madrid-2026-11-09",
    ],
  },
};

// Teams
const teams = {
  arsenal: {
    uuid: "t-arsenal",
    slug: "arsenal",
    names: {
      en: "Arsenal",
      pt: "Arsenal",
      es: "Arsenal",
    },
    shortNames: {
      en: "ARS",
    },
    crest: "https://images.cardapiofc.com/teams/arsenal.webp",
    country: {
      code: "GB",
    },
    leagueSlugs: ["premier-league"],
    matchSlugs: [
      "arsenal-vs-chelsea-2026-11-06",
      "manchester-city-vs-arsenal-2026-11-06",
    ],
  },
  chelsea: {
    uuid: "t-chelsea",
    slug: "chelsea",
    names: {
      en: "Chelsea",
      pt: "Chelsea",
      es: "Chelsea",
    },
    shortNames: {
      en: "CHE",
    },
    crest: "https://images.cardapiofc.com/teams/chelsea.webp",
    country: {
      code: "GB",
    },
    leagueSlugs: ["premier-league"],
    matchSlugs: [
      "arsenal-vs-chelsea-2026-11-06",
      "chelsea-vs-manchester-city-2026-11-08",
    ],
  },
  "manchester-city": {
    uuid: "t-manchester-city",
    slug: "manchester-city",
    names: {
      en: "Manchester City",
      pt: "Manchester City",
      es: "Manchester City",
    },
    shortNames: {
      en: "MCI",
    },
    crest: "https://images.cardapiofc.com/teams/manchester-city.webp",
    country: {
      code: "GB",
    },
    leagueSlugs: ["premier-league"],
    matchSlugs: [
      "manchester-city-vs-arsenal-2026-11-06",
      "chelsea-vs-manchester-city-2026-11-08",
    ],
  },
  flamengo: {
    uuid: "t-flamengo",
    slug: "flamengo",
    names: {
      en: "Flamengo",
      pt: "Flamengo",
      es: "Flamengo",
    },
    shortNames: {
      en: "FLA",
      pt: "FLA",
    },
    crest: "https://images.cardapiofc.com/teams/flamengo.webp",
    country: {
      code: "BR",
    },
    leagueSlugs: ["brasileirao-serie-a"],
    matchSlugs: [
      "flamengo-vs-palmeiras-2026-11-07",
      "sao-paulo-vs-flamengo-2026-11-08",
    ],
  },
  palmeiras: {
    uuid: "t-palmeiras",
    slug: "palmeiras",
    names: {
      en: "Palmeiras",
      pt: "Palmeiras",
      es: "Palmeiras",
    },
    shortNames: {
      en: "PAL",
      pt: "PAL",
    },
    crest: "https://images.cardapiofc.com/teams/palmeiras.webp",
    country: {
      code: "BR",
    },
    leagueSlugs: ["brasileirao-serie-a"],
    matchSlugs: [
      "flamengo-vs-palmeiras-2026-11-07",
      "palmeiras-vs-sao-paulo-2026-11-09",
    ],
  },
  "sao-paulo": {
    uuid: "t-sao-paulo",
    slug: "sao-paulo",
    names: {
      en: "São Paulo",
      pt: "São Paulo",
      es: "São Paulo",
    },
    shortNames: {
      en: "SAO",
      pt: "SAO",
    },
    crest: "https://images.cardapiofc.com/teams/sao-paulo.webp",
    country: {
      code: "BR",
    },
    leagueSlugs: ["brasileirao-serie-a"],
    matchSlugs: [
      "sao-paulo-vs-flamengo-2026-11-08",
      "palmeiras-vs-sao-paulo-2026-11-09",
    ],
  },
  "real-madrid": {
    uuid: "t-real-madrid",
    slug: "real-madrid",
    names: {
      en: "Real Madrid",
      pt: "Real Madrid",
      es: "Real Madrid",
    },
    shortNames: {
      en: "RMA",
      es: "RMA",
    },
    crest: "https://images.cardapiofc.com/teams/real-madrid.webp",
    country: {
      code: "ES",
    },
    leagueSlugs: ["la-liga"],
    matchSlugs: [
      "real-madrid-vs-barcelona-2026-11-08",
      "barcelona-vs-real-madrid-2026-11-09",
    ],
  },
  barcelona: {
    uuid: "t-barcelona",
    slug: "barcelona",
    names: {
      en: "Barcelona",
      pt: "Barcelona",
      es: "Barcelona",
    },
    shortNames: {
      en: "BAR",
      es: "FCB",
    },
    crest: "https://images.cardapiofc.com/teams/barcelona.webp",
    country: {
      code: "ES",
    },
    leagueSlugs: ["la-liga"],
    matchSlugs: [
      "real-madrid-vs-barcelona-2026-11-08",
      "barcelona-vs-real-madrid-2026-11-09",
    ],
  },
};

// Matches
// Note: all 7 statuses covered:
// 1. finished (FT)
// 2. halftime (HT)
// 3. live (2H)
// 4. scheduled (NS) - midnight spanning
// 5. postponed (PST) - zero channels
// 6. suspended (SUSP)
// 7. cancelled (CANC)
// 8. scheduled (NS)
const matches = {
  "arsenal-vs-chelsea-2026-11-06": {
    uuid: "m-arsenal-vs-chelsea-2026-11-06",
    slug: "arsenal-vs-chelsea-2026-11-06",
    kickoff: "2026-11-06T15:00:00Z",
    leagueSlug: "premier-league",
    homeSlug: "arsenal",
    awaySlug: "chelsea",
    status: "finished",
    statusShort: "FT",
    score: {
      home: 2,
      away: 1,
    },
    round: "Regular Season - 11",
    venue: {
      name: "Emirates Stadium",
      city: "London",
    },
    hasLineup: true,
  },
  "manchester-city-vs-arsenal-2026-11-06": {
    uuid: "m-manchester-city-vs-arsenal-2026-11-06",
    slug: "manchester-city-vs-arsenal-2026-11-06",
    kickoff: "2026-11-06T17:30:00Z",
    leagueSlug: "premier-league",
    homeSlug: "manchester-city",
    awaySlug: "arsenal",
    status: "halftime",
    statusShort: "HT",
    score: {
      home: 1,
      away: 0,
    },
    round: "Regular Season - 11",
    venue: {
      name: "Etihad Stadium",
      city: "Manchester",
    },
    hasLineup: true,
  },
  "flamengo-vs-palmeiras-2026-11-07": {
    uuid: "m-flamengo-vs-palmeiras-2026-11-07",
    slug: "flamengo-vs-palmeiras-2026-11-07",
    kickoff: "2026-11-07T19:00:00Z",
    leagueSlug: "brasileirao-serie-a",
    homeSlug: "flamengo",
    awaySlug: "palmeiras",
    status: "live",
    statusShort: "2H",
    score: {
      home: 1,
      away: 1,
    },
    round: "Rodada 33",
    venue: {
      name: "Maracanã",
      city: "Rio de Janeiro",
    },
    hasLineup: true,
  },
  "sao-paulo-vs-flamengo-2026-11-08": {
    uuid: "m-sao-paulo-vs-flamengo-2026-11-08",
    slug: "sao-paulo-vs-flamengo-2026-11-08",
    kickoff: "2026-11-08T01:30:00Z",
    leagueSlug: "brasileirao-serie-a",
    homeSlug: "sao-paulo",
    awaySlug: "flamengo",
    status: "scheduled",
    statusShort: "NS",
    score: null,
    round: "Rodada 34",
    venue: {
      name: "MorumBIS",
      city: "São Paulo",
    },
    hasLineup: false,
  },
  "real-madrid-vs-barcelona-2026-11-08": {
    uuid: "m-real-madrid-vs-barcelona-2026-11-08",
    slug: "real-madrid-vs-barcelona-2026-11-08",
    kickoff: "2026-11-08T14:00:00Z",
    leagueSlug: "la-liga",
    homeSlug: "real-madrid",
    awaySlug: "barcelona",
    status: "postponed",
    statusShort: "PST",
    score: null,
    round: "Jornada 12",
    venue: {
      name: "Santiago Bernabéu",
      city: "Madrid",
    },
    hasLineup: false,
  },
  "chelsea-vs-manchester-city-2026-11-08": {
    uuid: "m-chelsea-vs-manchester-city-2026-11-08",
    slug: "chelsea-vs-manchester-city-2026-11-08",
    kickoff: "2026-11-08T16:30:00Z",
    leagueSlug: "premier-league",
    homeSlug: "chelsea",
    awaySlug: "manchester-city",
    status: "suspended",
    statusShort: "SUSP",
    score: {
      home: 0,
      away: 0,
    },
    round: "Regular Season - 12",
    venue: {
      name: "Stamford Bridge",
      city: "London",
    },
    hasLineup: false,
  },
  "palmeiras-vs-sao-paulo-2026-11-09": {
    uuid: "m-palmeiras-vs-sao-paulo-2026-11-09",
    slug: "palmeiras-vs-sao-paulo-2026-11-09",
    kickoff: "2026-11-09T20:00:00Z",
    leagueSlug: "brasileirao-serie-a",
    homeSlug: "palmeiras",
    awaySlug: "sao-paulo",
    status: "cancelled",
    statusShort: "CANC",
    score: null,
    round: "Rodada 35",
    venue: {
      name: "Allianz Parque",
      city: "São Paulo",
    },
    hasLineup: false,
  },
  "barcelona-vs-real-madrid-2026-11-09": {
    uuid: "m-barcelona-vs-real-madrid-2026-11-09",
    slug: "barcelona-vs-real-madrid-2026-11-09",
    kickoff: "2026-11-09T21:00:00Z",
    leagueSlug: "la-liga",
    homeSlug: "barcelona",
    awaySlug: "real-madrid",
    status: "scheduled",
    statusShort: "NS",
    score: null,
    round: "Jornada 13",
    venue: {
      name: "Spotify Camp Nou",
      city: "Barcelona",
    },
    hasLineup: false,
  },
};

const matchOrder = Object.keys(matches).sort((a, b) => {
  const diff = matches[a].kickoff.localeCompare(matches[b].kickoff);
  return diff !== 0 ? diff : a.localeCompare(b);
});

// Lineups for matches where hasLineup: true
const lineups = {
  "arsenal-vs-chelsea-2026-11-06": {
    home: {
      formation: "4-3-3",
      coach: "Mikel Arteta",
      startXI: [
        { name: "David Raya", number: 22, pos: "G", grid: "1:1" },
        { name: "Ben White", number: 4, pos: "D", grid: "2:1" },
        { name: "William Saliba", number: 2, pos: "D", grid: "2:2" },
        { name: "Gabriel Magalhães", number: 6, pos: "D", grid: "2:3" },
        { name: "Jurriën Timber", number: 12, pos: "D", grid: "2:4" },
        { name: "Thomas Partey", number: 5, pos: "M", grid: "3:1" },
        { name: "Declan Rice", number: 41, pos: "M", grid: "3:2" },
        { name: "Martin Ødegaard", number: 8, pos: "M", grid: "3:3" },
        { name: "Bukayo Saka", number: 7, pos: "F", grid: "4:1" },
        { name: "Kai Havertz", number: 29, pos: "F", grid: "4:2" },
        { name: "Gabriel Martinelli", number: 11, pos: "F", grid: "4:3" },
      ],
      substitutes: [
        { name: "Neto", number: 32, pos: "G", grid: null },
        { name: "Jakub Kiwior", number: 15, pos: "D", grid: null },
        { name: "Jorginho", number: 20, pos: "M", grid: null },
        { name: "Mikel Merino", number: 23, pos: "M", grid: null },
        { name: "Leandro Trossard", number: 19, pos: "F", grid: null },
        { name: "Raheem Sterling", number: 30, pos: "F", grid: null },
        { name: "Gabriel Jesus", number: 9, pos: "F", grid: null },
      ],
    },
    away: {
      formation: "4-2-3-1",
      coach: "Enzo Maresca",
      startXI: [
        { name: "Robert Sánchez", number: 1, pos: "G", grid: "1:1" },
        { name: "Malo Gusto", number: 27, pos: "D", grid: "2:1" },
        { name: "Wesley Fofana", number: 29, pos: "D", grid: "2:2" },
        { name: "Levi Colwill", number: 6, pos: "D", grid: "2:3" },
        { name: "Marc Cucurella", number: 3, pos: "D", grid: "2:4" },
        { name: "Moisés Caicedo", number: 25, pos: "M", grid: "3:1" },
        { name: "Roméo Lavia", number: 45, pos: "M", grid: "3:2" },
        { name: "Noni Madueke", number: 11, pos: "M", grid: "4:1" },
        { name: "Cole Palmer", number: 20, pos: "M", grid: "4:2" },
        { name: "Pedro Neto", number: 7, pos: "M", grid: "4:3" },
        { name: "Nicolas Jackson", number: 15, pos: "F", grid: "5:1" },
      ],
      substitutes: [
        { name: "Filip Jørgensen", number: 12, pos: "G", grid: null },
        { name: "Tosin Adarabioyo", number: 4, pos: "D", grid: null },
        { name: "Renato Veiga", number: 40, pos: "D", grid: null },
        { name: "Enzo Fernández", number: 8, pos: "M", grid: null },
        { name: "Kiernan Dewsbury-Hall", number: 22, pos: "M", grid: null },
        { name: "Jadon Sancho", number: 19, pos: "F", grid: null },
        { name: "Christopher Nkunku", number: 18, pos: "F", grid: null },
      ],
    },
  },
  "manchester-city-vs-arsenal-2026-11-06": {
    home: {
      formation: "4-1-4-1",
      coach: "Pep Guardiola",
      startXI: [
        { name: "Ederson", number: 31, pos: "G", grid: "1:1" },
        { name: "Kyle Walker", number: 2, pos: "D", grid: "2:1" },
        { name: "Rúben Dias", number: 3, pos: "D", grid: "2:2" },
        { name: "Manuel Akanji", number: 25, pos: "D", grid: "2:3" },
        { name: "Joško Gvardiol", number: 24, pos: "D", grid: "2:4" },
        { name: "Rodri", number: 16, pos: "M", grid: "3:1" },
        { name: "Bernardo Silva", number: 20, pos: "M", grid: "4:1" },
        { name: "Kevin De Bruyne", number: 17, pos: "M", grid: "4:2" },
        { name: "Phil Foden", number: 47, pos: "M", grid: "4:3" },
        { name: "Jérémy Doku", number: 11, pos: "M", grid: "4:4" },
        { name: "Erling Haaland", number: 9, pos: "F", grid: "5:1" },
      ],
      substitutes: [
        { name: "Stefan Ortega", number: 18, pos: "G", grid: null },
        { name: "John Stones", number: 5, pos: "D", grid: null },
        { name: "Nathan Aké", number: 6, pos: "D", grid: null },
        { name: "Mateo Kovačić", number: 8, pos: "M", grid: null },
        { name: "Ilkay Gündogan", number: 19, pos: "M", grid: null },
        { name: "Jack Grealish", number: 10, pos: "F", grid: null },
        { name: "Savinho", number: 26, pos: "F", grid: null },
      ],
    },
    away: {
      formation: "4-3-3",
      coach: "Mikel Arteta",
      startXI: [
        { name: "David Raya", number: 22, pos: "G", grid: "1:1" },
        { name: "Ben White", number: 4, pos: "D", grid: "2:1" },
        { name: "William Saliba", number: 2, pos: "D", grid: "2:2" },
        { name: "Gabriel Magalhães", number: 6, pos: "D", grid: "2:3" },
        { name: "Jurriën Timber", number: 12, pos: "D", grid: "2:4" },
        { name: "Thomas Partey", number: 5, pos: "M", grid: "3:1" },
        { name: "Declan Rice", number: 41, pos: "M", grid: "3:2" },
        { name: "Martin Ødegaard", number: 8, pos: "M", grid: "3:3" },
        { name: "Bukayo Saka", number: 7, pos: "F", grid: "4:1" },
        { name: "Kai Havertz", number: 29, pos: "F", grid: "4:2" },
        { name: "Gabriel Martinelli", number: 11, pos: "F", grid: "4:3" },
      ],
      substitutes: [
        { name: "Neto", number: 32, pos: "G", grid: null },
        { name: "Jakub Kiwior", number: 15, pos: "D", grid: null },
        { name: "Jorginho", number: 20, pos: "M", grid: null },
        { name: "Mikel Merino", number: 23, pos: "M", grid: null },
        { name: "Leandro Trossard", number: 19, pos: "F", grid: null },
        { name: "Gabriel Jesus", number: 9, pos: "F", grid: null },
      ],
    },
  },
  "flamengo-vs-palmeiras-2026-11-07": {
    home: {
      formation: "4-2-3-1",
      coach: "Filipe Luís",
      startXI: [
        { name: "Agustín Rossi", number: 1, pos: "G", grid: "1:1" },
        { name: "Wesley", number: 43, pos: "D", grid: "2:1" },
        { name: "Léo Ortiz", number: 3, pos: "D", grid: "2:2" },
        { name: "Léo Pereira", number: 4, pos: "D", grid: "2:3" },
        { name: "Alex Sandro", number: 26, pos: "D", grid: "2:4" },
        { name: "Erick Pulgar", number: 5, pos: "M", grid: "3:1" },
        { name: "Nicolás De La Cruz", number: 18, pos: "M", grid: "3:2" },
        { name: "Gerson", number: 8, pos: "M", grid: "4:1" },
        { name: "Giorgian De Arrascaeta", number: 14, pos: "M", grid: "4:2" },
        { name: "Michael", number: 30, pos: "M", grid: "4:3" },
        { name: "Gabriel Barbosa", number: 99, pos: "F", grid: "5:1" },
      ],
      substitutes: [
        { name: "Matheus Cunha", number: 25, pos: "G", grid: null },
        { name: "Fabrício Bruno", number: 15, pos: "D", grid: null },
        { name: "Ayrton Lucas", number: 6, pos: "D", grid: null },
        { name: "Evertton Araújo", number: 52, pos: "M", grid: null },
        { name: "Carlos Alcaraz", number: 37, pos: "M", grid: null },
        { name: "Gonzalo Plata", number: 45, pos: "F", grid: null },
        { name: "Bruno Henrique", number: 27, pos: "F", grid: null },
      ],
    },
    away: {
      formation: "4-2-3-1",
      coach: "Abel Ferreira",
      startXI: [
        { name: "Weverton", number: 21, pos: "G", grid: "1:1" },
        { name: "Marcos Rocha", number: 2, pos: "D", grid: "2:1" },
        { name: "Gustavo Gómez", number: 15, pos: "D", grid: "2:2" },
        { name: "Murilo", number: 26, pos: "D", grid: "2:3" },
        { name: "Caio Paulista", number: 16, pos: "D", grid: "2:4" },
        { name: "Aníbal Moreno", number: 5, pos: "M", grid: "3:1" },
        { name: "Richard Ríos", number: 27, pos: "M", grid: "3:2" },
        { name: "Estêvão", number: 41, pos: "M", grid: "4:1" },
        { name: "Raphael Veiga", number: 23, pos: "M", grid: "4:2" },
        { name: "Felipe Anderson", number: 9, pos: "M", grid: "4:3" },
        { name: "Flaco López", number: 42, pos: "F", grid: "5:1" },
      ],
      substitutes: [
        { name: "Marcelo Lomba", number: 42, pos: "G", grid: null },
        { name: "Vitor Reis", number: 44, pos: "D", grid: null },
        { name: "Agustín Giay", number: 4, pos: "D", grid: null },
        { name: "Zé Rafael", number: 8, pos: "M", grid: null },
        { name: "Maurício", number: 18, pos: "M", grid: null },
        { name: "Dudu", number: 7, pos: "F", grid: null },
        { name: "Rony", number: 10, pos: "F", grid: null },
      ],
    },
  },
};

// Channels across 5 countries: GB, IE, BR, PT, AR
const channelsByCountry = {
  GB: {
    country: "GB",
    channels: {
      "sky-sports-main-event": {
        id: "sky-sports-main-event",
        name: "Sky Sports Main Event",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/sky-sports.webp",
        url: "https://www.skysports.com",
      },
      "tnt-sports-1": {
        id: "tnt-sports-1",
        name: "TNT Sports 1",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/tnt-sports.webp",
        url: "https://www.tntsports.co.uk",
      },
      "bbc-one": {
        id: "bbc-one",
        name: "BBC One",
        type: "free_tv",
        logo: "https://images.cardapiofc.com/channels/bbc-one.webp",
        url: "https://www.bbc.co.uk/iplayer",
      },
      "discovery-plus": {
        id: "discovery-plus",
        name: "discovery+",
        type: "streaming",
        logo: "https://images.cardapiofc.com/channels/discovery-plus.webp",
        url: "https://www.discoveryplus.com/gb",
      },
    },
    matches: {
      "arsenal-vs-chelsea-2026-11-06": [
        "sky-sports-main-event",
        "discovery-plus",
      ],
      "manchester-city-vs-arsenal-2026-11-06": ["sky-sports-main-event"],
      "chelsea-vs-manchester-city-2026-11-08": [
        "tnt-sports-1",
        "discovery-plus",
      ],
    },
  },
  IE: {
    country: "IE",
    channels: {
      "premier-sports-1": {
        id: "premier-sports-1",
        name: "Premier Sports 1",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/premier-sports.webp",
        url: "https://www.premiersports.com/ie",
      },
      "rte-two": {
        id: "rte-two",
        name: "RTÉ2",
        type: "free_tv",
        logo: "https://images.cardapiofc.com/channels/rte-two.webp",
        url: "https://www.rte.ie/player",
      },
      "now-tv-ie": {
        id: "now-tv-ie",
        name: "NOW TV Ireland",
        type: "streaming",
        logo: "https://images.cardapiofc.com/channels/now-tv.webp",
        url: "https://www.nowtv.com/ie",
      },
    },
    matches: {
      "arsenal-vs-chelsea-2026-11-06": ["premier-sports-1", "now-tv-ie"],
      "manchester-city-vs-arsenal-2026-11-06": ["premier-sports-1"],
      "chelsea-vs-manchester-city-2026-11-08": ["premier-sports-1"],
    },
  },
  BR: {
    country: "BR",
    channels: {
      "tv-globo": {
        id: "tv-globo",
        name: "TV Globo",
        type: "free_tv",
        logo: "https://images.cardapiofc.com/channels/tv-globo.webp",
        url: "https://globoplay.globo.com",
      },
      sportv: {
        id: "sportv",
        name: "SporTV",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/sportv.webp",
        url: "https://ge.globo.com/sportv",
      },
      premiere: {
        id: "premiere",
        name: "Premiere",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/premiere.webp",
        url: "https://premiere.globo.com",
      },
      cazetv: {
        id: "cazetv",
        name: "CazéTV",
        type: "streaming",
        logo: "https://images.cardapiofc.com/channels/cazetv.webp",
        url: "https://www.youtube.com/@CazeTV",
      },
      "disney-plus-br": {
        id: "disney-plus-br",
        name: "Disney+",
        type: "streaming",
        logo: "https://images.cardapiofc.com/channels/disney-plus.webp",
        url: "https://www.disneyplus.com",
      },
    },
    matches: {
      "arsenal-vs-chelsea-2026-11-06": ["disney-plus-br"],
      "flamengo-vs-palmeiras-2026-11-07": ["tv-globo", "premiere"],
      "sao-paulo-vs-flamengo-2026-11-08": ["sportv", "premiere"],
      "palmeiras-vs-sao-paulo-2026-11-09": ["cazetv", "premiere"],
    },
  },
  PT: {
    country: "PT",
    channels: {
      "sport-tv-1": {
        id: "sport-tv-1",
        name: "Sport TV 1",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/sport-tv.webp",
        url: "https://www.sporttv.pt",
      },
      "dazn-1-pt": {
        id: "dazn-1-pt",
        name: "DAZN 1",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/dazn.webp",
        url: "https://www.dazn.com/pt-PT",
      },
      "rtp-1": {
        id: "rtp-1",
        name: "RTP 1",
        type: "free_tv",
        logo: "https://images.cardapiofc.com/channels/rtp-1.webp",
        url: "https://www.rtp.pt/play",
      },
    },
    matches: {
      "arsenal-vs-chelsea-2026-11-06": ["dazn-1-pt"],
      "flamengo-vs-palmeiras-2026-11-07": ["sport-tv-1"],
      "barcelona-vs-real-madrid-2026-11-09": ["dazn-1-pt"],
    },
  },
  AR: {
    country: "AR",
    channels: {
      "espn-argentina": {
        id: "espn-argentina",
        name: "ESPN Argentina",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/espn.webp",
        url: "https://www.espn.com.ar",
      },
      "tyc-sports": {
        id: "tyc-sports",
        name: "TyC Sports",
        type: "tv",
        logo: "https://images.cardapiofc.com/channels/tyc-sports.webp",
        url: "https://www.tycsports.com",
      },
      "disney-plus-ar": {
        id: "disney-plus-ar",
        name: "Disney+ Argentina",
        type: "streaming",
        logo: "https://images.cardapiofc.com/channels/disney-plus.webp",
        url: "https://www.disneyplus.com",
      },
    },
    matches: {
      "arsenal-vs-chelsea-2026-11-06": ["espn-argentina", "disney-plus-ar"],
      "sao-paulo-vs-flamengo-2026-11-08": ["tyc-sports"],
      "barcelona-vs-real-madrid-2026-11-09": [
        "espn-argentina",
        "disney-plus-ar",
      ],
    },
  },
};

// Write leagues.json
fs.writeFileSync(
  path.join(outDir, "leagues.json"),
  JSON.stringify({ schemaVersion, generatedAt, leagues }, null, 2) + "\n",
  "utf8",
);

// Write teams.json
fs.writeFileSync(
  path.join(outDir, "teams.json"),
  JSON.stringify({ schemaVersion, generatedAt, teams }, null, 2) + "\n",
  "utf8",
);

// Write matches.json
fs.writeFileSync(
  path.join(outDir, "matches.json"),
  JSON.stringify(
    { schemaVersion, generatedAt, order: matchOrder, matches },
    null,
    2,
  ) + "\n",
  "utf8",
);

// Write lineups.json
fs.writeFileSync(
  path.join(outDir, "lineups.json"),
  JSON.stringify({ schemaVersion, generatedAt, lineups }, null, 2) + "\n",
  "utf8",
);

// Write channel files
for (const [cc, data] of Object.entries(channelsByCountry)) {
  fs.writeFileSync(
    path.join(channelsDir, `${cc}.json`),
    JSON.stringify({ schemaVersion, generatedAt, ...data }, null, 2) + "\n",
    "utf8",
  );
}

// Initial index.json (skeleton - will be finalized and hashed by cfc-data-index.mjs)
const initialIndex = {
  schemaVersion,
  generatedAt,
  window: {
    from: "2026-11-06T15:00:00Z",
    to: "2026-11-09T21:00:00Z",
  },
  countries: ["AR", "BR", "GB", "IE", "PT"],
  files: {},
  counts: {
    leagues: Object.keys(leagues).length,
    teams: Object.keys(teams).length,
    matches: Object.keys(matches).length,
    lineups: Object.keys(lineups).length,
  },
};

fs.writeFileSync(
  path.join(outDir, "index.json"),
  JSON.stringify(initialIndex, null, 2) + "\n",
  "utf8",
);

console.log("Sample dataset generated successfully in", outDir);

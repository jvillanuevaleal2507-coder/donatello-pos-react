const STORE_TERMS = [
  "amazon",
  "walmart",
  "home depot",
  "lowe's",
  "lowes",
  "wayfair",
  "target",
  "ebay",
];

const NOISE_TERMS = [
  "free shipping",
  "best seller",
  "new arrival",
  "shop now",
  "online only",
  "exclusive",
  "official store",
];

const DICTIONARY = [
  [/\bdining table\b/gi, "mesa de comedor"],
  [/\bdining set\b/gi, "comedor"],
  [/\bnightstand\b/gi, "buró"],
  [/\bside table\b/gi, "mesa auxiliar"],
  [/\bcoffee table\b/gi, "mesa de centro"],
  [/\bbar stools?\b/gi, "bancos altos"],
  [/\brocking chair\b/gi, "mecedora"],
  [/\barmchair\b/gi, "sillón"],
  [/\bmirror\b/gi, "espejo"],
  [/\bdesk lamp\b/gi, "lámpara de buró"],
  [/\bfloor lamp\b/gi, "lámpara de piso"],
  [/\btable lamp\b/gi, "lámpara de mesa"],
  [/\btv stand\b/gi, "mueble para TV"],
  [/\bstorage cabinet\b/gi, "gabinete de almacenamiento"],
  [/\bbookcase\b/gi, "librero"],
  [/\bset of\b/gi, "juego de"],
  [/\bwith\b/gi, "con"],
  [/\bfor\b/gi, "para"],
  [/\bwood\b/gi, "madera"],
  [/\bindustrial\b/gi, "industrial"],
  [/\bmodern\b/gi, "moderno"],
  [/\brustic\b/gi, "rústico"],
];

function removeTerms(title, terms) {
  return terms.reduce(
    (current, term) =>
      current.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), ""),
    title
  );
}

export function normalizeProductTitle(rawTitle = "", maxLength = 70) {
  let title = String(rawTitle || "").trim();

  title = removeTerms(title, STORE_TERMS);
  title = removeTerms(title, NOISE_TERMS);

  for (const [pattern, replacement] of DICTIONARY) {
    title = title.replace(pattern, replacement);
  }

  title = title
    .replace(/[|•]/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (title.length > maxLength) {
    title = title.slice(0, maxLength).trim().replace(/\s+\S*$/, "");
  }

  return title
    ? title.charAt(0).toUpperCase() + title.slice(1)
    : "";
}

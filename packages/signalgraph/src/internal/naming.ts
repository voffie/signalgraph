const identifierRegex = /[^a-zA-Z0-9]+/;

function splitIdentifier(text: string) {
  return text
    .trim()
    .split(identifierRegex)
    .filter(Boolean);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ensureValidIdentifier(text: string) {
  if (text.length === 0) {
    return "_";
  }

  if (/^[0-9]/.test(text)) {
    return `_${text}`;
  }

  return text;
}

export function toPropertyName(text: string) {
  const parts = splitIdentifier(text);

  const identifier = parts
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : capitalize(part)
    )
    .join("");

  return ensureValidIdentifier(identifier);
}

export function toTypeName(text: string) {
  const identifier = splitIdentifier(text)
    .map(capitalize)
    .join("");

  return ensureValidIdentifier(identifier);
}

function parseSemver(value: string): [number, number, number] | null {
  const cleaned = value.trim().replace(/^v/, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/);
  if (!match) return null;

  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10),
  ];
}

export function semverLtOrInvalid(a: string, b: string): boolean {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) return true;

  const [aMaj, aMin, aPat] = parsedA;
  const [bMaj, bMin, bPat] = parsedB;

  if (aMaj !== bMaj) return aMaj < bMaj;
  if (aMin !== bMin) return aMin < bMin;
  return aPat < bPat;
}

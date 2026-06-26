import { KYCCountry } from './types';

export const DOCUPASS_COUNTRY_URL = 'https://v.idanalyzer.com/asset/country.json';

interface RemoteCountry {
  iso?: unknown;
  name_en?: unknown;
}

export async function fetchDocupassCountries(
  filterCodes?: string[] | null,
): Promise<KYCCountry[]> {
  const response = await fetch(`${DOCUPASS_COUNTRY_URL}?ts=${Date.now()}`, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`Unable to load countries (HTTP ${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Country service returned an invalid response.');
  }

  const allowedCodes = filterCodes?.length
    ? new Set(filterCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))
    : null;
  const countries = new Map<string, KYCCountry>();

  for (const item of payload as RemoteCountry[]) {
    const code = typeof item.iso === 'string' ? item.iso.trim().toUpperCase() : '';
    const name = typeof item.name_en === 'string' ? item.name_en.trim() : '';
    if (!code || !name || countries.has(code) || (allowedCodes && !allowedCodes.has(code))) {
      continue;
    }
    countries.set(code, { code, name, flag: '' });
  }

  if (countries.size === 0) {
    throw new Error('Country service returned no available countries.');
  }

  return [...countries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

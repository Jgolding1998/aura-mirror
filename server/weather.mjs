import { fail } from './images.mjs';

function description(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code <= 48) return 'foggy';
  if (code <= 57) return 'drizzly';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rainy';
  if (code <= 86) return 'snowy';
  return 'stormy';
}

let cache;
export async function currentWeather({ city, lat, lon }) {
  const latitude = Number(lat), longitude = Number(lon);
  if (!city || !lat || !lon || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw fail(503, 'Set a weather city in Aura’s server settings.');
  const key = `${city}:${latitude}:${longitude}`;
  if (cache?.key === key && cache.expires > Date.now()) return cache.value;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: lat, longitude: lon, current: 'temperature_2m,weather_code', temperature_unit: 'fahrenheit',
  }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Weather service returned an error.');
    const { current } = await response.json();
    if (!Number.isFinite(current?.temperature_2m) || !Number.isInteger(current?.weather_code)) throw new Error('Missing conditions.');
    const value = { city, temperature: Math.round(current.temperature_2m), conditions: description(current.weather_code) };
    cache = { key, value, expires: Date.now() + 5 * 60_000 };
    return value;
  } catch {
    throw fail(502, 'Weather is temporarily unavailable.');
  }
}

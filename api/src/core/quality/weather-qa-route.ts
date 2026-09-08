export const WEATHER_API_ROUTE_PATTERN = /^https:\/\/(?:api|geocoding-api)\.open-meteo\.com\//i;

export function isWeatherApiUrl(value: unknown): boolean {
  return WEATHER_API_ROUTE_PATTERN.test(String(value || ''));
}

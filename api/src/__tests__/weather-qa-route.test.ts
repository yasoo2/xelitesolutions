import { isWeatherApiUrl, WEATHER_API_ROUTE_PATTERN } from '../core/quality/weather-qa-route';

describe('weather browser QA routing', () => {
  test.each([
    'https://api.open-meteo.com/v1/forecast?latitude=31.95',
    'https://geocoding-api.open-meteo.com/v1/search?name=Istanbul',
  ])('intercepts every Open-Meteo service used by generated weather apps: %s', url => {
    expect(isWeatherApiUrl(url)).toBe(true);
    expect(url).toMatch(WEATHER_API_ROUTE_PATTERN);
  });

  test.each([
    'https://open-meteo.example/v1/forecast',
    'https://evil-open-meteo.com/v1/search',
    'http://api.open-meteo.com/v1/forecast',
  ])('does not intercept unrelated or insecure traffic: %s', url => {
    expect(isWeatherApiUrl(url)).toBe(false);
  });
});

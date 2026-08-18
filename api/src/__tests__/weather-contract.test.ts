import { formatWeatherSemanticRepair, inspectWeatherEngineSource } from '../core/quality/weather-contract';

describe('request-driven weather semantic contract', () => {
    const request = `WeatherGo
Include sunrise and sunset from the daily API response.
Persist favorites and Celsius/Fahrenheit settings after reload using localStorage.`;

    it('reports missing sun times and unsafe persistence as independent defects', () => {
        const defects = inspectWeatherEngineSource(request, `export default function WeatherApp() {
            const [favorites, setFavorites] = React.useState([]);
            React.useEffect(() => localStorage.setItem('favorites', JSON.stringify(favorites)), [favorites]);
            return <button onClick={() => setFavorites([])}>Save</button>;
        }`);
        expect(defects.map(defect => defect.id)).toEqual(expect.arrayContaining([
            'weather_sun_times_missing',
            'weather_persistence_not_hydrated',
        ]));
        expect(formatWeatherSemanticRepair(defects)).toContain('Request daily sunrise and sunset');
    });

    it('accepts source evidence for daily sun values and hydrated persistence', () => {
        const source = `
            const daily = 'sunrise,sunset,temperature_2m_max';
            const [favorites, setFavorites] = React.useState(() => {
                const raw = localStorage.getItem('weathergo:favorites');
                return raw ? JSON.parse(raw) : [];
            });
            const [hydrated, setHydrated] = React.useState(true);
            React.useEffect(() => {
                if (hydrated) localStorage.setItem('weathergo:favorites', JSON.stringify(favorites));
            }, [hydrated, favorites]);
            function formatSunrise(value) { return value; }
            function formatSunset(value) { return value; }
            const sunrise = data.daily.sunrise[0];
            const sunset = data.daily.sunset[0];
            return <section><span>Sunrise {formatSunrise(sunrise)}</span><span>Sunset {formatSunset(sunset)}</span></section>;
        `;
        expect(inspectWeatherEngineSource(request, source)).toEqual([]);
    });
});

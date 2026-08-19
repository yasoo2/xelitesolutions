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

    it('requires a real visible city search flow when the request asks for search', () => {
        const requestWithSearch = `${request}\nSearch for a real city using a visible field, Search button, and Enter.`;
        const missing = inspectWeatherEngineSource(requestWithSearch, 'export default function WeatherApp(){ return <main>weather</main>; }');
        expect(missing.map(defect => defect.id)).toContain('weather_city_search_missing');

        const source = `
            const [cityQuery, setCityQuery] = React.useState('');
            function searchCity() { return cityQuery.trim(); }
            return <form onSubmit={e => { e.preventDefault(); searchCity(); }}>
                <input type="search" value={cityQuery} onChange={e => setCityQuery(e.target.value)} aria-label="Search city" />
                <button type="submit">Search</button>
            </form>;
        `;
        expect(inspectWeatherEngineSource(requestWithSearch, source).map(defect => defect.id)).not.toContain('weather_city_search_missing');
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

    it('accepts distributed evidence when the API request and visible rendering are in separate files', () => {
        const apiFile = 'const params = { daily: ["sunrise", "sunset"] };';
        const viewFile = '<div>{sunrise}</div><div>{sunset}</div>';
        const defects = inspectWeatherEngineSource('sunrise sunset', apiFile, [viewFile]);
        expect(defects.find(defect => defect.id === 'weather_sun_times_missing')).toBeUndefined();
    });

    it('rejects distributed evidence when either the API request or visible rendering is absent', () => {
        const apiFile = 'const params = { daily: ["sunrise", "sunset"] };';
        const defects = inspectWeatherEngineSource('sunrise sunset', apiFile);
        expect(defects.find(defect => defect.id === 'weather_sun_times_missing')).toBeDefined();

        const viewFile = '<div>{sunrise}</div><div>{sunset}</div>';
        const missingRequest = inspectWeatherEngineSource('sunrise sunset', viewFile);
        expect(missingRequest.find(defect => defect.id === 'weather_sun_times_missing')).toBeDefined();
    });
});

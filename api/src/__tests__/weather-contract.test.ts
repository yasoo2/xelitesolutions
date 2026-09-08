import { formatWeatherSemanticRepair, inspectWeatherEngineSource } from '../core/quality/weather-contract';
import { fileWeatherAppJsx, fileWorkflowAppJsx } from '../modules/tools/definitions/react-app-templates';

describe('request-driven weather semantic contract', () => {
    const request = `WeatherGo
Include sunrise and sunset from the daily API response.
Persist favorites after reload using localStorage.`;

    it('marks the active weather navigation destination for users and QA', () => {
        const source = fileWeatherAppJsx(false, 'Build a weather application.');
        expect(source).toContain("aria-current={screen === key ? 'page' : undefined}");
    });

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

    it('rejects a fallback that is hidden behind an early error return', () => {
        const request = 'Use a real public weather API with loading, empty/error, retry, last-updated, Celsius/Fahrenheit, and an offline fallback labelled as fallback.';
        const source = `
            const [weatherData, setWeatherData] = useState(null);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);
            const [unit, setUnit] = useState('celsius');
            const [lastUpdated, setLastUpdated] = useState(null);
            async function fetchWeatherData() {
                try {
                    const response = await fetch('https://api.open-meteo.com/v1/forecast?current_weather=true');
                    if (!response.ok) throw new Error('failed');
                    setWeatherData((await response.json()).current_weather);
                } catch (error) {
                    setError(error.message);
                    setWeatherData(sampleData);
                    setLastUpdated('Fallback data');
                }
            }
            const convert = value => unit === 'celsius' ? value : value * 9 / 5 + 32;
            if (loading) return <div>Loading weather data...</div>;
            if (error) return <div>Error {error}<button onClick={fetchWeatherData}>Retry</button></div>;
            if (!weatherData) return <div>No weather data available</div>;
            return <main><button onClick={() => setUnit('fahrenheit')}>Fahrenheit °F</button><button onClick={() => setUnit('celsius')}>Celsius °C</button><p>Last updated: {lastUpdated}</p></main>;
        `;
        const ids = inspectWeatherEngineSource(request, source).map(defect => defect.id);
        expect(ids).toContain('weather_offline_fallback_unobservable');
        expect(ids).toContain('weather_empty_state_missing');
        expect(ids).not.toContain('weather_persistence_not_hydrated');
    });

    it('accepts an explicit live/fallback state machine with every requested state visible', () => {
        const request = 'Use a real public weather API with loading, empty/error, retry, last-updated, Celsius/Fahrenheit, and an offline fallback labelled as fallback.';
        const source = `
            const [weatherData, setWeatherData] = useState([]);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);
            const [unit, setUnit] = useState('celsius');
            const [lastUpdated, setLastUpdated] = useState(null);
            const [dataSource, setDataSource] = useState('live');
            async function fetchWeatherData() {
                setLoading(true); setError(null);
                try {
                    const response = await fetch('https://api.open-meteo.com/v1/forecast?current_weather=true');
                    if (!response.ok) throw new Error('failed');
                    setWeatherData([(await response.json()).current_weather]);
                    setDataSource('live'); setLastUpdated(new Date());
                } catch (error) {
                    setError(error.message); setWeatherData(sampleData); setDataSource('fallback'); setLastUpdated(new Date());
                } finally { setLoading(false); }
            }
            const convert = value => unit === 'celsius' ? value : value * 9 / 5 + 32;
            return <main>
                {loading ? <p>Loading weather data...</p> : null}
                {!loading && weatherData.length === 0 ? <p>No weather data available</p> : null}
                {error ? <p>Error: {error}<button onClick={fetchWeatherData}>Retry</button></p> : null}
                {dataSource === 'fallback' ? <strong>Offline fallback sample data</strong> : null}
                <button onClick={() => setUnit('celsius')}>Celsius °C</button>
                <button onClick={() => setUnit('fahrenheit')}>Fahrenheit °F</button>
                <p>Last updated: {lastUpdated}</p>{weatherData.map(item => <p>{convert(item.temperature)}</p>)}
            </main>;
        `;
        expect(inspectWeatherEngineSource(request, source)).toEqual([]);
    });

    it('builds named comparison cities into the request-derived weather engine and subjects it to the same contract', () => {
        const request = 'Create a weather comparison app for Amman, Istanbul, and London using a real public weather API with loading, empty/error, retry, Celsius/Fahrenheit, last-updated, and an offline fallback labelled as fallback.';
        const source = fileWeatherAppJsx(false, request);
        expect(source).toContain('const REQUESTED_CITY_NAMES = ["Amman","Istanbul","London"]');
        expect(source).toContain('Offline fallback · cached sample data');
        expect(source.match(/City comparison/g)).toHaveLength(1);
        expect(fileWorkflowAppJsx(false)).not.toContain('City comparison');
        expect(source).toContain('type="search" required');
        expect(source).toContain('<h2>WeatherGo</h2>');
        expect(source).not.toContain('<h1>WeatherGo</h1>');
        expect(source).toContain('Last updated');
        expect(inspectWeatherEngineSource(request, source)).toEqual([]);
    });
});

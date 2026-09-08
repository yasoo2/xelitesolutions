/**
 * Semantic contract for request-driven weather engines.
 *
 * The stock WeatherApp is intentionally not copied into request-driven builds:
 * Joe's author must learn the domain from the request. That makes the compile
 * and import gates insufficient on their own. This contract is deliberately
 * small and evidence-based: it checks that behaviour named by the request is
 * represented in the authored source before the artifact can be delivered.
 */

export interface WeatherSemanticDefect {
    id: string;
    message: string;
    repairInstruction: string;
}

const count = (source: string, pattern: RegExp): number =>
    String(source || '').match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))?.length || 0;

const asks = (request: string, pattern: RegExp): boolean => pattern.test(String(request || ''));

/**
 * Return only defects that are explicitly relevant to this request. The result
 * is used both as an acceptance gate and as a bounded repair brief for Joe's
 * own file author; it never edits a generated project directly.
 */
export function inspectWeatherEngineSource(
    requestRaw: string,
    sourceRaw: string,
    additionalEvidence: string[] = [],
): WeatherSemanticDefect[] {
    const request = String(requestRaw || '');
    // A real artifact may distribute the request, state, and visible UI across
    // several source files. Preserve the authored file as the primary evidence
    // and add only the bounded production snapshot supplied by the caller.
    const source = [String(sourceRaw || ''), ...additionalEvidence.map(value => String(value || ''))].join('\n');
    const defects: WeatherSemanticDefect[] = [];

    if (asks(request, /real\s+public\s+weather\s+api|live[-\s]?success|live\s+weather|weather\s+api|طقس\s+حي|واجهة\s+طقس/i)) {
        const hasWeatherRequest = /fetch\s*\([^)]*(?:open-meteo|weatherapi|openweathermap)|api\.open-meteo\.com|current_weather|current\s*[:=]\s*[^\n]*(?:temperature|weather)/i.test(source);
        const checksResponse = /\.ok\b|status\s*[<>=!]=?\s*(?:200|400)|throw\s+new\s+Error/i.test(source);
        if (!hasWeatherRequest || !checksResponse) defects.push({
            id: 'weather_live_api_missing',
            message: 'Live weather from a validated public API is not proven.',
            repairInstruction: 'Fetch live weather from a named public API, validate response.ok, and map current conditions into visible city data. Never label sample data as live.',
        });
    }

    if (asks(request, /loading|جاري\s+التحميل|تحميل/i)) {
        const state = /\[(?:is)?loading\s*,\s*set(?:Is)?Loading\]|\bsetLoading\s*\(/i.test(source);
        const visible = /(?:is)?loading\s*\?[^:]{0,500}(?:Loading|جاري|تحميل)|if\s*\(\s*(?:is)?loading\s*\)[\s\S]{0,500}(?:Loading|جاري|تحميل)/i.test(source);
        if (!state || !visible) defects.push({
            id: 'weather_loading_state_missing',
            message: 'The requested loading state is not visibly represented.',
            repairInstruction: 'Track loading around every weather request and render a labelled loading state in the content region.',
        });
    }

    if (asks(request, /empty(?:\s+state)?|no\s+(?:weather|cities|results|data)|حالة\s+فارغة|لا\s+توجد\s+(?:بيانات|نتائج)/i)) {
        const visible = /(?:No\s+(?:weather|cities|results|data)|Nothing\s+to\s+show|Empty\s+state|لا\s+توجد\s+(?:بيانات|نتائج|مدن))/i.test(source);
        const guarded = /(?:weatherData|cities|results|data)\s*\.\s*length\s*(?:===?\s*0|<\s*1)|!\s*(?:weatherData|cities|results|data)\s*\.\s*length/i.test(source);
        if (!visible || !guarded) defects.push({
            id: 'weather_empty_state_missing',
            message: 'The requested empty state is not proven.',
            repairInstruction: 'Render a distinct empty state driven by the empty weather collection, with a useful recovery action.',
        });
    }

    if (asks(request, /error|retry|network\s+failure|فشل|خطأ|إعادة\s+المحاولة/i)) {
        const errorState = /\berror\s*,\s*setError\b|\bsetError\s*\(/i.test(source);
        const retry = /onClick\s*=\s*\{?[^}\n]*(?:retry|fetchWeather|loadWeather)|>\s*(?:Retry|Try again|إعادة\s+المحاولة)\s*</i.test(source);
        if (!errorState || !retry) defects.push({
            id: 'weather_retry_state_missing',
            message: 'A visible error state with a connected retry action is not proven.',
            repairInstruction: 'Render a clear error message with Retry connected to the live request, and clear stale error state after recovery.',
        });
    }

    if (asks(request, /offline\s+fallback|cached\s+sample|sample\s+data\s+label|label(?:led)?\s+as\s+fallback|بديل|دون\s+اتصال|بيانات\s+مخبأة/i)) {
        const state = /\b(?:isFallback|usingFallback|fallbackActive|dataSource|sourceMode)\b/i.test(source);
        const setState = /set(?:IsFallback|UsingFallback|FallbackActive|DataSource|SourceMode)\s*\(/i.test(source);
        const visible = /(?:isFallback|usingFallback|fallbackActive|dataSource|sourceMode)[\s\S]{0,500}(?:Fallback|Cached|Offline|Sample|بديل|مخبأة|دون اتصال)/i.test(source);
        if (!state || !setState || !visible) defects.push({
            id: 'weather_offline_fallback_unobservable',
            message: 'Fallback data may be assigned, but a distinct visible fallback state is not proven.',
            repairInstruction: 'Track live versus fallback explicitly. On network failure, show cached/sample city data with a visible Fallback/Offline label and Retry; never hide fallback behind an error-only return.',
        });
    }

    if (asks(request, /last[-\s]?updated|updated\s+at|آخر\s+تحديث/i)) {
        const state = /\b(?:lastUpdated|updatedAt)\b/i.test(source);
        const visible = /(?:Last\s+updated|Updated\s+at|آخر\s+تحديث)[\s\S]{0,180}(?:lastUpdated|updatedAt)|(?:lastUpdated|updatedAt)[\s\S]{0,180}(?:Last\s+updated|Updated\s+at|آخر\s+تحديث)/i.test(source);
        if (!state || !visible) defects.push({
            id: 'weather_last_updated_missing',
            message: 'The requested last-updated timestamp is not visibly connected to state.',
            repairInstruction: 'Set lastUpdated after live and fallback loads and render it beside an explicit Last updated label.',
        });
    }

    if (asks(request, /celsius\s*\/\s*fahrenheit|celsius|fahrenheit|°\s*[CF]|مئوي|فهرنهايت/i)) {
        const state = /\b(?:unit|temperatureUnit)\s*,\s*set(?:Unit|TemperatureUnit)\b/i.test(source);
        const conversion = /\*\s*9\s*\)?\s*\/\s*5\s*\+\s*32|\(\s*[^)]+-\s*32\s*\)\s*\*\s*5\s*\/\s*9/i.test(source);
        const controls = /(?:°C|Celsius)[\s\S]{0,900}(?:°F|Fahrenheit)|(?:°F|Fahrenheit)[\s\S]{0,900}(?:°C|Celsius)/i.test(source);
        if (!state || !conversion || !controls) defects.push({
            id: 'weather_unit_toggle_incomplete',
            message: 'The Celsius/Fahrenheit round-trip is not fully represented.',
            repairInstruction: 'Use one unit state for every city, expose both unit controls, convert correctly, and preserve the city collection during the round-trip.',
        });
    }

    if (asks(request, /sunrise|sunset|الشروق|الغروب/i)) {
        const sunriseCount = count(source, /sunrise/i);
        const sunsetCount = count(source, /sunset/i);
        const requestsDailySun = /daily\s*[:=][^\n]{0,260}(sunrise|sunset)|daily[^\n]{0,260}(sunrise|sunset)/i.test(source);
        const rendersSun = sunriseCount >= 2 && sunsetCount >= 2;
        if (sunriseCount < 2 || sunsetCount < 2 || !requestsDailySun || !rendersSun) {
            defects.push({
                id: 'weather_sun_times_missing',
                message: 'The weather engine does not prove both sunrise and sunset are requested from the daily API response and rendered visibly.',
                repairInstruction: 'Request daily sunrise and sunset fields from the Open-Meteo forecast response, validate the arrays, and render both labelled values in the visible city details UI using the selected city timezone/time format. Keep one source occurrence for the API request and one or more occurrences for the rendered output.',
            });
        }
    }

    const asksSearch = asks(request, /\bsearch\b|search\s+button|pressing\s+enter|بحث|مدينة/i);
    if (asksSearch) {
        const hasSearchState = /\b(?:setQuery|setSearch(?:Term|Query)?|searchTerm|cityQuery|handleSearch|searchCity)\b/i.test(source);
        const hasVisibleSearchField = /<input\b[\s\S]{0,260}(?:type\s*=\s*["']search|placeholder\s*=\s*[^>]*(?:search|city|بحث|مدينة)|aria-label\s*=\s*[^>]*(?:search|city|بحث|مدينة))/i.test(source);
        const hasSearchTrigger = /onSubmit\s*=|onKeyDown\s*=\s*\{?[\s\S]{0,180}(?:Enter|handleSearch|searchCity)|onClick\s*=\s*\{?[\s\S]{0,180}(?:handleSearch|searchCity)|>\s*(?:Search|بحث)\s*</i.test(source);
        if (!hasSearchState || !hasVisibleSearchField || !hasSearchTrigger) {
            defects.push({
                id: 'weather_city_search_missing',
                message: 'The weather engine does not prove a visible city search field connected to a real search action and keyboard/button trigger.',
                repairInstruction: 'Implement a visible city search input with controlled state, connect it to the real geocoding request through a named search handler, and support both the Search button and Enter key. Reject empty input, show loading while the request is active, and surface an explicit error for an unknown city or failed request. Do not hardcode city results.',
            });
        }
    }

    const asksPersistence = asks(request, /localStorage|persist|persistence|after\s+reload|favorites?|saved\s+cities|saved\s+settings|remember\s+(?:the\s+)?(?:unit|settings|cities)|المفضلة|المحفوظ|إعادة\s+التحميل|الإعدادات/i);
    if (asksPersistence) {
        const hasStorageRead = /localStorage\s*\.\s*getItem|sessionStorage\s*\.\s*getItem/i.test(source);
        const hasStorageWrite = /localStorage\s*\.\s*setItem|sessionStorage\s*\.\s*setItem/i.test(source);
        const hasStateHydration = /useState\s*\(\s*\(\s*\)\s*=>[\s\S]{0,420}(?:localStorage|sessionStorage)\s*\.\s*getItem/i.test(source)
            || /(?:hydrated|isHydrated|storageReady|initialized|isInitialized|ready)\s*[,=]/i.test(source);
        const hasWriteAfterHydration = /(?:hydrated|isHydrated|storageReady|initialized|isInitialized|ready)[\s\S]{0,420}(?:setItem|write\s*\()/i.test(source)
            || /useEffect\s*\(\s*\(\s*\)\s*=>[\s\S]{0,420}(?:setItem|write\s*\()/i.test(source);
        if (!hasStorageRead || !hasStorageWrite || !hasStateHydration || !hasWriteAfterHydration) {
            defects.push({
                id: 'weather_persistence_not_hydrated',
                message: 'Favorites or settings persistence is not safely hydrated before the initial empty state can be written back over stored values.',
                repairInstruction: 'Use namespaced localStorage keys derived from content.storeKey. Hydrate favorites and every requested setting through lazy state initializers or an explicit hydration gate, then persist changes only after hydration is complete so the first render cannot overwrite stored values with defaults. Restore the values after a full reload and avoid duplicate favorites.',
            });
        }
    }

    return defects;
}

export function formatWeatherSemanticRepair(defects: WeatherSemanticDefect[]): string {
    if (!defects.length) return '';
    return defects.map((defect, index) => `${index + 1}. [${defect.id}] ${defect.message}\nRepair: ${defect.repairInstruction}`).join('\n');
}

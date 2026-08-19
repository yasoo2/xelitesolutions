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
export function inspectWeatherEngineSource(requestRaw: string, sourceRaw: string): WeatherSemanticDefect[] {
    const request = String(requestRaw || '');
    const source = String(sourceRaw || '');
    const defects: WeatherSemanticDefect[] = [];

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

    const asksPersistence = asks(request, /localStorage|persist|persistence|after\s+reload|reload|favorites?|saved\s+cities|settings|celsius|fahrenheit|temperature\s+unit|12[-\s]?hour|24[-\s]?hour|المفضلة|المحفوظ|إعادة\s+التحميل|الإعدادات|الوحدة/i);
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

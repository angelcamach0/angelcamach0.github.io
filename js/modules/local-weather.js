const WEATHER_API_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const REVERSE_GEOCODE_API_URL = "https://geocoding-api.open-meteo.com/v1/reverse";

function getPreferredLocale() {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
        return navigator.languages[0];
    }

    return navigator.language || "en-US";
}

function getWeatherConfig() {
    const fahrenheitRegions = new Set(["BS", "BZ", "KY", "LR", "PW", "US"]);
    const locale = getPreferredLocale();
    let region = "";

    if (typeof Intl.Locale === "function") {
        try {
            region = new Intl.Locale(locale).maximize().region || "";
        } catch (error) {
            region = "";
        }
    }

    if (!region) {
        region = locale.split(/[-_]/)[1] || "";
    }

    const useFahrenheit = fahrenheitRegions.has(region.toUpperCase());
    return {
        temperatureUnit: useFahrenheit ? "fahrenheit" : "celsius",
        symbol: useFahrenheit ? "°F" : "°C",
    };
}

function formatLocationLabel(place) {
    if (!place || typeof place !== "object") return "Local";

    const primary = [
        place.city,
        place.name,
        place.locality,
        place.admin2,
    ].find((value) => typeof value === "string" && value.trim());

    const secondary = [
        place.admin1,
        place.country_code,
    ].find((value) => typeof value === "string" && value.trim());

    if (!primary) return "Local";
    if (!secondary || String(primary).toLowerCase() === String(secondary).toLowerCase()) {
        return String(primary).trim();
    }

    return `${String(primary).trim()}, ${String(secondary).trim()}`;
}

export function createLocalWeatherController(options = {}) {
    const {
        tempEl = null,
        labelEl = null,
        metaEl = null,
    } = options;
    const weatherConfig = getWeatherConfig();
    let localWeatherCoords = null;

    function setWeatherPlaceholder() {
        if (!tempEl) return;
        tempEl.textContent = `--${weatherConfig.symbol}`;
    }

    function setLocationLabel(value) {
        const label = String(value || "").trim() || "Local";

        if (labelEl) {
            labelEl.textContent = label;
            labelEl.title = label;
        }

        if (metaEl) {
            metaEl.setAttribute("aria-label", `${label} weather and local time`);
        }
    }

    async function loadLocationLabel(latitude, longitude) {
        const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            count: "1",
            language: "en",
            format: "json",
        });

        try {
            const response = await fetch(`${REVERSE_GEOCODE_API_URL}?${params.toString()}`, {
                headers: {
                    accept: "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`reverse geocode request failed: ${response.status}`);
            }

            const data = await response.json();
            setLocationLabel(formatLocationLabel(data?.results?.[0]));
        } catch (error) {
            setLocationLabel("Local");
        }
    }

    async function loadWeather(latitude, longitude) {
        if (!tempEl) return;

        const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            current: "temperature_2m",
            temperature_unit: weatherConfig.temperatureUnit,
        });

        try {
            const response = await fetch(`${WEATHER_API_BASE_URL}?${params.toString()}`, {
                headers: {
                    accept: "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`weather request failed: ${response.status}`);
            }

            const data = await response.json();
            const temperature = data?.current?.temperature_2m;
            tempEl.textContent = Number.isFinite(temperature)
                ? `${Math.round(temperature)}${weatherConfig.symbol}`
                : `--${weatherConfig.symbol}`;
        } catch (error) {
            setWeatherPlaceholder();
        }
    }

    function refresh() {
        if (!localWeatherCoords) return;
        loadWeather(localWeatherCoords.latitude, localWeatherCoords.longitude);
    }

    function start() {
        setWeatherPlaceholder();
        setLocationLabel("Local");

        if (!("geolocation" in navigator)) return;

        navigator.geolocation.getCurrentPosition((position) => {
            localWeatherCoords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            };

            loadLocationLabel(localWeatherCoords.latitude, localWeatherCoords.longitude);
            refresh();
        }, () => {
            setWeatherPlaceholder();
            setLocationLabel("Local");
        }, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 15 * 60 * 1000,
        });
    }

    return {
        refresh,
        start,
    };
}

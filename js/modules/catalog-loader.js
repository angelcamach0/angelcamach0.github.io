export function createTileCatalogLoader(options = {}) {
    const {
        fallbackUrl = "",
        remoteUrl = "",
        normalizeTileRecord = (value) => value,
        compareTiles = () => 0,
        onLoaded = () => {},
        onError = () => {},
    } = options;

    let items = [];
    let loaded = false;
    let loadPromise = null;

    async function loadCatalogSource(sourceUrl) {
        const response = await fetch(sourceUrl, {
            headers: {
                accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`tile catalog request failed: ${response.status}`);
        }

        const payload = await response.json();
        const records = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
        return records.map((tile, index) => normalizeTileRecord(tile, index));
    }

    async function load() {
        if (loaded) {
            return items;
        }

        if (loadPromise) {
            return loadPromise;
        }

        loadPromise = (async () => {
            const mergedCatalog = new Map();
            let loadedRemote = false;
            let loadedLocal = false;
            let lastError = null;

            if (fallbackUrl) {
                try {
                    const localRecords = await loadCatalogSource(fallbackUrl);
                    localRecords.forEach((tile) => {
                        mergedCatalog.set(tile.id, tile);
                    });
                    loadedLocal = true;
                } catch (error) {
                    lastError = error;
                }
            }

            if (remoteUrl) {
                try {
                    const remoteRecords = await loadCatalogSource(remoteUrl);
                    remoteRecords.forEach((tile) => {
                        mergedCatalog.set(tile.id, tile);
                    });
                    loadedRemote = true;
                } catch (error) {
                    lastError = error;
                }
            }

            if (lastError && !loadedRemote && !loadedLocal) {
                onError(lastError);
            }

            items = Array.from(mergedCatalog.values()).sort(compareTiles);
            loaded = true;
            onLoaded({
                items,
                source: loadedRemote && loadedLocal
                    ? "merged"
                    : loadedRemote
                        ? "remote"
                        : loadedLocal
                            ? "local"
                            : "none",
            });

            return items;
        })();

        try {
            return await loadPromise;
        } finally {
            loadPromise = null;
        }
    }

    return {
        load,
        isLoaded() {
            return loaded;
        },
    };
}

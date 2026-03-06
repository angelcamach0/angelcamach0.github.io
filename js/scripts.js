(function () {
    const grid = document.getElementById("bubble-grid");
    const homeView = document.getElementById("home-view");
    const terminalView = document.getElementById("terminal-view");
    const homeStage = document.getElementById("home-title");
    const homeTitleLabel = document.getElementById("home-title-label");
    const homeDescription = document.getElementById("home-description");
    const texasTemp = document.querySelector("[data-texas-temp]");
    const texasTime = document.querySelector("[data-texas-time]");
    const welcomeLetters = document.getElementById("welcome-letters");
    const titleBar = document.querySelector(".title-bar");
    const titleBarNav = document.querySelector(".title-bar__nav");
    const pageViews = document.querySelector(".page-views");
    const catalogEndpointMeta = document.querySelector('meta[name="ark-catalog-endpoint"]');
    const terminalInstances = [];
    const pageNodes = new Map();
    const root = document.documentElement;
    if (!grid) return;

    const extraScrollScreens = 2;
    const terminalPrompt = "friend@thearkprojects:~$";
    const texasTimeFormatter = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Chicago",
    });
    const texasWeatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=30.2672&longitude=-97.7431&current=temperature_2m&temperature_unit=fahrenheit";
    const tileCatalogFallbackUrl = "data/tiles.json";
    const tileCatalogRemoteUrl = catalogEndpointMeta?.content?.trim() || "";
    const tileTypeAliases = new Map([
        ["code", "code"],
        ["codes", "code"],
        ["script", "code"],
        ["scripts", "code"],
        ["guide", "guide"],
        ["guides", "guide"],
        ["post", "post"],
        ["posts", "post"],
        ["journal", "journal"],
        ["journals", "journal"],
        ["note", "note"],
        ["notes", "note"],
        ["doc", "doc"],
        ["docs", "doc"],
        ["document", "doc"],
        ["documents", "doc"],
    ]);
    let homeTitleText = homeStage?.getAttribute("aria-label") || "Welcome.";
    const welcomeBodies = [];
    const gravity = 2200;
    const bounce = 0.48;
    const floorFriction = 0.985;
    let pageHead = null;
    let pageTail = null;
    let activeView = "home";
    let hasRendered = false;
    let dragBody = null;
    let dragPointerId = null;
    let lastPointerSample = null;
    let physicsFrame = null;
    let physicsLastTime = 0;
    let terminalBuffer = "";
    let terminalTranscript = [];
    let activeTerminalShell = null;
    let currentDirectory = "~";
    let cmatrixActive = false;
    let cmatrixFrame = null;
    let cmatrixLastTime = 0;
    const cmatrixFallbackSource = "friend@thearkprojects:~$lshome/grid/terminal/";
    let tileCatalog = [];
    let tileCatalogLoaded = false;
    let tileCatalogSource = "local";
    const tilePreviewCache = new Map();
    const tilePreviewRequests = new Map();
    let invertHideTimer = null;
    let tileFilter = {
        mode: "all",
        value: "all",
        label: "all",
    };

    function updateTexasTime() {
        if (!texasTime) return;
        texasTime.textContent = texasTimeFormatter.format(new Date());
    }

    async function loadTexasWeather() {
        if (!texasTemp) return;

        try {
            const response = await fetch(texasWeatherUrl, {
                headers: {
                    accept: "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`weather request failed: ${response.status}`);
            }

            const data = await response.json();
            const temperature = data?.current?.temperature_2m;
            texasTemp.textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°F` : "--°F";
        } catch (error) {
            texasTemp.textContent = "--°F";
        }
    }

    function getActiveView() {
        const hash = window.location.hash.toLowerCase().replace(/^#/, "");
        if (pageNodes.has(hash)) return hash;
        return "home";
    }

    function createPageNode(name, element, options = {}) {
        return {
            name,
            element,
            prev: null,
            next: null,
            navLabel: options.navLabel || formatPageName(name),
            showInNav: options.showInNav !== false,
            editable: Boolean(options.editable),
            kind: options.kind || "static",
            titleEl: options.titleEl || null,
            titleLabelEl: options.titleLabelEl || null,
            descriptionEl: options.descriptionEl || null,
            titleText: options.titleText || "",
            descriptionText: options.descriptionText || "",
        };
    }

    function formatPageName(name) {
        return name
            .split(/[-_\s]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function normalizeTileType(value) {
        return tileTypeAliases.get(String(value || "").trim().toLowerCase()) || null;
    }

    function createSlug(value, fallback) {
        const slug = String(value || fallback || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        return slug || fallback;
    }

    function normalizeMimeType(value) {
        return String(value || "")
            .split(";")[0]
            .trim()
            .toLowerCase();
    }

    function normalizeTileRecord(rawTile, index) {
        const type = normalizeTileType(rawTile?.type) || "note";
        const title = String(rawTile?.title || `Untitled ${index + 1}`).trim();
        const summary = String(rawTile?.summary || "No summary yet.").trim();
        const repo = String(rawTile?.repo || "").trim();
        const path = String(rawTile?.path || "").trim();
        const mimeType = normalizeMimeType(rawTile?.mimeType || rawTile?.mime_type || "");
        const tags = Array.isArray(rawTile?.tags)
            ? rawTile.tags
                .map((tag) => String(tag || "").trim().toLowerCase())
                .filter(Boolean)
            : [];
        const href = String(rawTile?.href || "").trim();
        const previewHref = String(rawTile?.previewHref || rawTile?.preview_href || "").trim();
        const id = createSlug(rawTile?.id || title, `tile-${index + 1}`);
        const order = Number.isFinite(Number(rawTile?.order)) ? Number(rawTile.order) : index;
        const size = Number.isFinite(Number(rawTile?.size)) ? Number(rawTile.size) : 0;

        return {
            id,
            type,
            title,
            summary,
            repo,
            path,
            mimeType,
            tags,
            href,
            previewHref,
            order,
            size,
        };
    }

    function inferMimeTypeFromPath(value) {
        const lower = String(value || "").toLowerCase();

        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".md")) return "text/markdown";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".ts")) return "text/plain";
        if (lower.endsWith(".py")) return "text/plain";
        if (lower.endsWith(".sh")) return "text/plain";
        if (lower.endsWith(".html")) return "text/html";

        return "";
    }

    function getTileMimeType(tile) {
        return normalizeMimeType(tile?.mimeType || inferMimeTypeFromPath(tile?.path || tile?.href || ""));
    }

    function getTilePreviewMode(tile) {
        if (!tile?.href || tile.virtual) return "none";

        const mimeType = getTileMimeType(tile);
        if (mimeType.startsWith("image/")) return "image";
        if (mimeType === "application/pdf") return "pdf";
        if (mimeType === "text/markdown") return "markdown";
        if (tile.type === "code") return "code";
        if (
            mimeType.startsWith("text/") ||
            mimeType.includes("javascript") ||
            mimeType === "application/json"
        ) {
            return tile.type === "code" ? "code" : "text";
        }

        return "none";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderInlineMarkdown(text) {
        return escapeHtml(text)
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    }

    function renderMarkdownPreviewHtml(markdown) {
        const lines = String(markdown || "").replace(/\r/g, "").split("\n").slice(0, 120);
        const html = [];
        let paragraph = [];
        let listType = null;
        let listItems = [];
        let inCodeBlock = false;
        let codeLines = [];

        function flushParagraph() {
            if (!paragraph.length) return;
            html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
            paragraph = [];
        }

        function flushList() {
            if (!listType || !listItems.length) return;
            html.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
            listType = null;
            listItems = [];
        }

        function flushCodeBlock() {
            if (!codeLines.length) return;
            html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
            codeLines = [];
        }

        lines.forEach((rawLine) => {
            const line = rawLine.trimEnd();
            const trimmed = line.trim();

            if (trimmed.startsWith("```")) {
                flushParagraph();
                flushList();
                if (inCodeBlock) {
                    flushCodeBlock();
                    inCodeBlock = false;
                } else {
                    inCodeBlock = true;
                }
                return;
            }

            if (inCodeBlock) {
                codeLines.push(line);
                return;
            }

            if (!trimmed) {
                flushParagraph();
                flushList();
                return;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                flushParagraph();
                flushList();
                const level = headingMatch[1].length;
                html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
                return;
            }

            const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
            if (orderedMatch) {
                flushParagraph();
                if (listType && listType !== "ol") {
                    flushList();
                }
                listType = "ol";
                listItems.push(orderedMatch[1]);
                return;
            }

            const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
            if (unorderedMatch) {
                flushParagraph();
                if (listType && listType !== "ul") {
                    flushList();
                }
                listType = "ul";
                listItems.push(unorderedMatch[1]);
                return;
            }

            const quoteMatch = trimmed.match(/^>\s+(.*)$/);
            if (quoteMatch) {
                flushParagraph();
                flushList();
                html.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
                return;
            }

            paragraph.push(trimmed);
        });

        flushParagraph();
        flushList();
        if (inCodeBlock) {
            flushCodeBlock();
        }

        return html.join("") || "<p>Preview unavailable.</p>";
    }

    function buildTextPreviewSnippet(text, mode) {
        const lines = String(text || "")
            .replace(/\r/g, "")
            .split("\n")
            .map((line) => mode === "code" ? line.slice(0, 120) : line);
        const previewLines = lines.slice(0, mode === "code" ? 80 : 60);
        let snippet = previewLines.join("\n").trim();

        if (!snippet) {
            return mode === "code" ? "// preview unavailable" : "Preview unavailable.";
        }

        if (snippet.length > 5000) {
            snippet = `${snippet.slice(0, 5000).trimEnd()}\n...`;
        }

        if (lines.length > previewLines.length) {
            snippet = `${snippet}\n...`;
        }

        return snippet;
    }

    function compareTiles(left, right) {
        if (left.order !== right.order) return left.order - right.order;
        return left.title.localeCompare(right.title);
    }

    function getKnownTileTypes() {
        const catalogTypes = tileCatalog.map((tile) => tile.type);
        return Array.from(new Set([...tileTypeAliases.values(), ...catalogTypes])).sort();
    }

    function describeTileFilter(filter = tileFilter) {
        switch (filter.mode) {
            case "type":
                return filter.value;
            case "tag":
                return `tag:${filter.value}`;
            case "repo":
                return `repo:${filter.value}`;
            case "query":
                return `query:${filter.value}`;
            default:
                return "all";
        }
    }

    function formatTileSource(tile) {
        return [tile.repo, tile.path].filter(Boolean).join(" / ") || "unassigned";
    }

    function filterTileCatalog() {
        switch (tileFilter.mode) {
            case "type":
                return tileCatalog.filter((tile) => tile.type === tileFilter.value);
            case "tag":
                return tileCatalog.filter((tile) => tile.tags.includes(tileFilter.value));
            case "repo":
                return tileCatalog.filter((tile) => tile.repo.toLowerCase() === tileFilter.value);
            case "query":
                return tileCatalog.filter((tile) => {
                    const haystack = [
                        tile.id,
                        tile.type,
                        tile.title,
                        tile.summary,
                        tile.repo,
                        tile.path,
                        tile.tags.join(" "),
                    ]
                        .join(" ")
                        .toLowerCase();

                    return haystack.includes(tileFilter.value);
                });
            default:
                return tileCatalog.slice();
        }
    }

    function createCatalogStateTile(title, summary) {
        return {
            id: "__catalog-state__",
            type: "note",
            title,
            summary,
            repo: "site",
            path: "data/tiles.json",
            tags: ["system"],
            href: "",
            order: -1,
            virtual: true,
        };
    }

    function getVisibleCatalogTiles() {
        const filtered = filterTileCatalog();

        if (filtered.length > 0) {
            return filtered;
        }

        if (!tileCatalogLoaded) {
            return [createCatalogStateTile("Loading catalog", "Waiting for tile metadata to load.")];
        }

        if (tileCatalog.length === 0) {
            return [
                createCatalogStateTile(
                    "Catalog empty",
                    "Upload content to the R2 bucket or keep using the local fallback catalog."
                ),
            ];
        }

        return [
            createCatalogStateTile(
                "No matches",
                `No tiles matched ${describeTileFilter()}. Run "search all" to reset.`
            ),
        ];
    }

    function formatSearchSummary() {
        const visibleCount = filterTileCatalog().length;
        const totalCount = tileCatalog.length;

        if (tileFilter.mode === "all") {
            return `search: showing all ${totalCount} catalog tiles`;
        }

        return `search: showing ${visibleCount} of ${totalCount} tiles for ${describeTileFilter()}`;
    }

    function parseSearchCommand(rawCommand) {
        const parts = rawCommand.trim().split(/\s+/);
        if (parts.length < 2) {
            return {
                error: `usage: search [all|${getKnownTileTypes().join("|")}|tag <tag>|repo <repo>|query]`,
            };
        }

        const scope = parts[1].toLowerCase();

        if (scope === "all" || scope === "reset") {
            return {
                mode: "all",
                value: "all",
                label: "all",
            };
        }

        if (scope === "tag") {
            const value = parts.slice(2).join(" ").trim().toLowerCase();
            if (!value) {
                return {
                    error: "usage: search tag <tag>",
                };
            }

            return {
                mode: "tag",
                value,
                label: `tag:${value}`,
            };
        }

        if (scope === "repo") {
            const value = parts.slice(2).join(" ").trim().toLowerCase();
            if (!value) {
                return {
                    error: "usage: search repo <repo>",
                };
            }

            return {
                mode: "repo",
                value,
                label: `repo:${value}`,
            };
        }

        const type = normalizeTileType(scope);
        if (type) {
            return {
                mode: "type",
                value: type,
                label: type,
            };
        }

        const query = parts.slice(1).join(" ").trim().toLowerCase();
        if (!query) {
            return {
                error: "usage: search <query>",
            };
        }

        return {
            mode: "query",
            value: query,
            label: `query:${query}`,
        };
    }

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

    async function loadTileCatalog() {
        const mergedCatalog = new Map();
        let loadedRemote = false;
        let loadedLocal = false;
        let lastError = null;

        if (tileCatalogFallbackUrl) {
            try {
                const localRecords = await loadCatalogSource(tileCatalogFallbackUrl);
                localRecords.forEach((tile) => {
                    mergedCatalog.set(tile.id, tile);
                });
                loadedLocal = true;
            } catch (error) {
                lastError = error;
            }
        }

        if (tileCatalogRemoteUrl) {
            try {
                const remoteRecords = await loadCatalogSource(tileCatalogRemoteUrl);
                remoteRecords.forEach((tile) => {
                    mergedCatalog.set(tile.id, tile);
                });
                loadedRemote = true;
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError && !loadedRemote && !loadedLocal) {
            console.error("Failed to load tile catalog", lastError);
        }

        tileCatalog = Array.from(mergedCatalog.values()).sort(compareTiles);
        tileCatalogSource = loadedRemote && loadedLocal
            ? "merged"
            : loadedRemote
                ? "remote"
                : loadedLocal
                    ? "local"
                    : "none";
        tileCatalogLoaded = true;
        requestSync();
    }

    function getCatalogSourceLabel() {
        switch (tileCatalogSource) {
            case "merged":
                return "remote+local";
            case "remote":
                return "remote";
            case "local":
                return "local";
            default:
                return "unavailable";
        }
    }

    function appendPageNode(node) {
        if (!pageHead) {
            pageHead = node.name;
            pageTail = node.name;
            pageNodes.set(node.name, node);
            return node;
        }

        return insertPageNodeAfter(pageTail, node);
    }

    function insertPageNodeAfter(afterName, node) {
        const afterNode = pageNodes.get(afterName);
        if (!afterNode) {
            pageNodes.set(node.name, node);
            if (!pageHead) {
                pageHead = node.name;
                pageTail = node.name;
            }
            return node;
        }

        const nextName = afterNode.next;
        node.prev = afterNode.name;
        node.next = nextName;
        afterNode.next = node.name;

        if (nextName) {
            const nextNode = pageNodes.get(nextName);
            if (nextNode) {
                nextNode.prev = node.name;
            }
        } else {
            pageTail = node.name;
        }

        pageNodes.set(node.name, node);

        if (afterNode.element && node.element) {
            afterNode.element.insertAdjacentElement("afterend", node.element);
        }

        return node;
    }

    function unregisterTerminalInstancesWithin(element) {
        if (!element) return;

        for (let index = terminalInstances.length - 1; index >= 0; index -= 1) {
            const instance = terminalInstances[index];
            if (element.contains(instance.shell)) {
                if (activeTerminalShell === instance.shell) {
                    activeTerminalShell = null;
                }
                terminalInstances.splice(index, 1);
            }
        }
    }

    function removePageNode(name) {
        const node = getPageNode(name);
        if (!node) return null;

        if (node.prev) {
            const prevNode = getPageNode(node.prev);
            if (prevNode) {
                prevNode.next = node.next;
            }
        } else {
            pageHead = node.next;
        }

        if (node.next) {
            const nextNode = getPageNode(node.next);
            if (nextNode) {
                nextNode.prev = node.prev;
            }
        } else {
            pageTail = node.prev;
        }

        unregisterTerminalInstancesWithin(node.element);
        node.element?.remove();
        pageNodes.delete(name);
        return node;
    }

    function getPageNode(name) {
        return pageNodes.get(name) || null;
    }

    function getPageNamesInOrder() {
        const names = [];
        let cursor = pageHead;

        while (cursor) {
            names.push(cursor);
            cursor = pageNodes.get(cursor)?.next || null;
        }

        return names;
    }

    function getPageIndex(name) {
        return getPageNamesInOrder().indexOf(name);
    }

    function getPageComponents(page) {
        if (!page) return [];

        if (page.kind === "home") {
            return [
                "terminal",
                "welcome-stage",
                "description",
            ];
        }

        if (page.kind === "grid") {
            return [
                "bubble-grid",
                "terminal@00-0A",
                "tile-catalog",
            ];
        }

        if (page.kind === "terminal") {
            return [
                "terminal",
            ];
        }

        return [
            "terminal",
            "tittle",
            "description",
        ];
    }

    function getEditableFields(page) {
        return page?.editable ? ["tittle", "description"] : [];
    }

    function buildTreeOutput() {
        const lines = ["/"];

        getPageNamesInOrder().forEach((name) => {
            const page = getPageNode(name);
            const components = getPageComponents(page);
            const editableFields = getEditableFields(page);

            lines.push(`  ${name}/`);
            lines.push(`    components: ${components.join(", ")}`);
            if (page?.kind === "grid") {
                lines.push(`    filter: ${describeTileFilter()}`);
                lines.push(`    source: ${getCatalogSourceLabel()}`);
                lines.push(`    catalog: ${tileCatalog.length} items`);
                lines.push(`    types: ${getKnownTileTypes().join(", ")}`);
            }
            if (editableFields.length > 0) {
                lines.push(`    editable: ${editableFields.join(", ")}`);
            }
        });

        return lines.join("\n");
    }

    function initializePageChain() {
        appendPageNode(createPageNode("home", homeView, {
            navLabel: "Home",
            showInNav: true,
            editable: true,
            kind: "home",
            titleEl: homeStage,
            titleLabelEl: homeTitleLabel,
            descriptionEl: homeDescription,
            titleText: homeTitleText,
            descriptionText: homeDescription?.textContent?.trim() || "",
        }));
        appendPageNode(createPageNode("grid", grid, {
            navLabel: "Grid",
            kind: "grid",
        }));
        appendPageNode(createPageNode("terminal", terminalView, {
            navLabel: "Terminal",
            kind: "terminal",
        }));
    }

    function renderNavigation(viewName) {
        if (!titleBarNav) return;

        titleBarNav.textContent = "";

        getPageNamesInOrder()
            .map((name) => getPageNode(name))
            .filter((node) => node && node.showInNav)
            .forEach((node) => {
                const link = document.createElement("a");
                link.href = `#${node.name}`;
                link.dataset.view = node.name;
                link.textContent = node.navLabel;
                link.classList.toggle("is-active", node.name === viewName);
                titleBarNav.appendChild(link);
            });
    }

    function getEnteringView(viewName) {
        return getPageNode(viewName)?.element || homeView;
    }

    function getEntranceClass(currentView, nextView) {
        const currentOrder = getPageIndex(currentView);
        const nextOrder = getPageIndex(nextView);
        return nextOrder > currentOrder ? "is-entering-from-right" : "is-entering-from-left";
    }

    function getPreferredTerminalInstance(viewName) {
        return terminalInstances.find((instance) => instance.view === viewName) || terminalInstances[0] || null;
    }

    function isTerminalInstanceVisible(instance) {
        return Boolean(instance && instance.shell && !instance.shell.closest("[hidden]"));
    }

    function normalizeTerminalLine(shell) {
        const line = shell.querySelector(".terminal-line");
        if (!line) return;

        Array.from(line.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
                node.remove();
            }
        });
    }

    function registerTerminalInstance(shell) {
        if (!shell) return null;

        const existing = terminalInstances.find((instance) => instance.shell === shell);
        if (existing) {
            return existing;
        }

        normalizeTerminalLine(shell);

        const instance = {
            shell,
            history: shell.querySelector("[data-terminal-history]"),
            input: shell.querySelector("[data-terminal-input]"),
            view: shell.dataset.terminalView || "",
        };
        const capture = document.createElement("textarea");

        capture.className = "terminal-capture";
        capture.setAttribute("aria-hidden", "true");
        capture.setAttribute("autocapitalize", "off");
        capture.setAttribute("autocomplete", "off");
        capture.setAttribute("autocorrect", "off");
        capture.setAttribute("enterkeyhint", "send");
        capture.spellcheck = false;
        shell.appendChild(capture);
        instance.capture = capture;

        ensureCmatrixLayer(instance);

        shell.addEventListener("pointerdown", () => {
            activeTerminalShell = shell;
            focusTerminal(instance.view || activeView);
        });
        shell.addEventListener("paste", (event) => {
            if (!isTerminalInputActive()) return;
            const pasted = event.clipboardData?.getData("text");
            if (!pasted) return;
            event.preventDefault();
            terminalBuffer += pasted.replace(/\r/g, "");
            renderTerminal();
        });
        capture.addEventListener("keydown", (event) => {
            if (!isTerminalInputActive()) return;

            if (cmatrixActive) {
                if (event.key === "Escape" || event.key === "Esc") {
                    event.preventDefault();
                    stopCmatrix();
                    return;
                }

                if (event.ctrlKey && event.key.toLowerCase() === "c") {
                    event.preventDefault();
                    stopCmatrix();
                    return;
                }

                if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "q") {
                    event.preventDefault();
                    stopCmatrix();
                    return;
                }
            }

            if (event.key === "Tab") {
                event.preventDefault();
                const start = capture.selectionStart || capture.value.length;
                const end = capture.selectionEnd || capture.value.length;
                capture.setRangeText("    ", start, end, "end");
                terminalBuffer = capture.value.replace(/\r/g, "");
                renderTerminal();
            }
        });
        capture.addEventListener("input", () => {
            const rawValue = capture.value.replace(/\r/g, "");

            if (rawValue.includes("\n")) {
                terminalBuffer = rawValue.replace(/\n+/g, "");
                capture.value = "";
                appendTerminalEntry(terminalBuffer);
                runTerminalCommand(terminalBuffer);
                terminalBuffer = "";
                renderTerminal();
                return;
            }

            terminalBuffer = rawValue;
            renderTerminal();
        });

        terminalInstances.push(instance);
        return instance;
    }

    function ensureCmatrixLayer(instance) {
        if (!instance || instance.matrixLayer) return;

        const layer = document.createElement("div");
        const label = document.createElement("div");
        const canvas = document.createElement("canvas");

        layer.className = "terminal-matrix";
        layer.dataset.terminalMatrix = "";
        layer.setAttribute("aria-hidden", "true");

        label.className = "terminal-matrix__label";
        label.textContent = "CMATRIX · ESC / Q / CTRL+C";

        canvas.className = "terminal-matrix__canvas";

        layer.appendChild(canvas);
        layer.appendChild(label);
        instance.shell.appendChild(layer);

        instance.matrixLayer = layer;
        instance.matrixCanvas = canvas;
        instance.matrixContext = canvas.getContext("2d");
        instance.matrixColumns = [];
        instance.matrixFontSize = 16;
        instance.matrixRowHeight = 24;
        instance.matrixColumnWidth = 10;
        instance.matrixFontFamily = '"Courier New", "Lucida Console", monospace';
        instance.matrixFontWeight = "400";
        instance.matrixWidth = 0;
        instance.matrixHeight = 0;
        instance.matrixDpr = 1;
        instance.matrixSource = cmatrixFallbackSource;
    }

    function buildCmatrixSource(instance) {
        if (!instance) return cmatrixFallbackSource;

        const lines = [];
        instance.history?.querySelectorAll(".terminal-entry, .terminal-output").forEach((line) => {
            lines.push((line.textContent || "").replace(/\u00A0/g, " "));
        });

        const prompt = instance.shell.querySelector(".terminal-line .terminal-prompt")?.textContent || terminalPrompt;
        const input = instance.input?.textContent || "";
        lines.push(`${prompt}${input}`);

        const normalized = lines
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        return normalized || cmatrixFallbackSource;
    }

    function getCmatrixFont(instance) {
        return `${instance.matrixFontWeight} ${instance.matrixFontSize}px ${instance.matrixFontFamily}`;
    }

    function syncCmatrixTypography(instance) {
        if (!instance?.matrixContext) return;

        const styles = window.getComputedStyle(instance.shell);
        const fontSize = parseFloat(styles.fontSize) || 16;
        const lineHeight = parseFloat(styles.lineHeight) || (fontSize * 1.55);
        const fontFamily = styles.fontFamily || '"Courier New", "Lucida Console", monospace';
        const fontWeight = styles.fontWeight || "400";

        instance.matrixFontSize = fontSize;
        instance.matrixRowHeight = lineHeight;
        instance.matrixFontFamily = fontFamily;
        instance.matrixFontWeight = fontWeight;
        instance.matrixContext.font = getCmatrixFont(instance);
        instance.matrixColumnWidth = Math.max(8, Math.ceil(instance.matrixContext.measureText("M").width));
        instance.matrixContext.textBaseline = "top";
    }

    function createCmatrixColumn(instance) {
        const height = instance.matrixHeight || instance.shell.clientHeight || 0;
        const rowHeight = instance.matrixRowHeight || instance.matrixFontSize || 16;
        const rows = Math.max(1, Math.ceil(height / rowHeight));
        const sourceLength = Math.max(1, (instance.matrixSource || cmatrixFallbackSource).length);

        return {
            head: -Math.random() * rows * 1.4,
            speed: 0.55 + (Math.random() * 1.7),
            length: Math.max(6, Math.floor(rows * (0.14 + (Math.random() * 0.18)))),
            offset: Math.floor(Math.random() * sourceLength),
        };
    }

    function resetCmatrixColumns(instance) {
        if (!instance) return;

        const width = instance.matrixWidth || instance.shell.clientWidth || 0;
        const columnWidth = instance.matrixColumnWidth || instance.matrixFontSize || 16;
        const columnCount = Math.max(1, Math.floor(width / columnWidth));

        instance.matrixColumns = Array.from({ length: columnCount }, () => createCmatrixColumn(instance));
    }

    function respawnCmatrixColumn(instance, index) {
        instance.matrixColumns[index] = createCmatrixColumn(instance);
    }

    function resizeCmatrixLayer(instance) {
        if (!instance?.matrixCanvas || !instance.matrixContext) return false;

        const width = Math.max(0, instance.shell.clientWidth);
        const height = Math.max(0, instance.shell.clientHeight);

        if (!width || !height) {
            return false;
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (width === instance.matrixWidth && height === instance.matrixHeight && dpr === instance.matrixDpr) {
            return true;
        }

        instance.matrixWidth = width;
        instance.matrixHeight = height;
        instance.matrixDpr = dpr;
        instance.matrixFontSize = Math.max(12, Math.min(22, Math.floor(Math.min(width, height) / 24)));
        instance.matrixCanvas.width = Math.floor(width * dpr);
        instance.matrixCanvas.height = Math.floor(height * dpr);
        instance.matrixCanvas.style.width = `${width}px`;
        instance.matrixCanvas.style.height = `${height}px`;
        instance.matrixContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        syncCmatrixTypography(instance);

        resetCmatrixColumns(instance);
        return true;
    }

    function getCmatrixChar(source, index) {
        const sourceLength = Math.max(1, source.length);

        for (let offset = 0; offset < sourceLength; offset += 1) {
            const candidate = source.charAt((index + offset + sourceLength) % sourceLength);
            if (candidate && !/\s/.test(candidate)) {
                return candidate;
            }
        }

        return source.charAt((index + sourceLength) % sourceLength) || " ";
    }

    function renderCmatrixFrame(deltaMs) {
        const step = Math.max(0.75, deltaMs / 16.6667);

        terminalInstances.forEach((instance) => {
            if (!instance.matrixCanvas || !instance.matrixContext) return;
            if (!resizeCmatrixLayer(instance)) return;

            const ctx = instance.matrixContext;
            const width = instance.matrixWidth;
            const height = instance.matrixHeight;
            const rowHeight = instance.matrixRowHeight || instance.matrixFontSize;
            const columnWidth = instance.matrixColumnWidth || instance.matrixFontSize;
            const maxRow = Math.ceil(height / rowHeight);
            const source = instance.matrixSource || cmatrixFallbackSource;
            const sourceLength = Math.max(1, source.length);

            ctx.fillStyle = "rgba(5, 5, 5, 0.22)";
            ctx.fillRect(0, 0, width, height);
            ctx.font = getCmatrixFont(instance);

            instance.matrixColumns.forEach((column, index) => {
                const x = index * columnWidth;
                const headRow = Math.floor(column.head);
                const trailLength = column.length;

                for (let trailIndex = 0; trailIndex < trailLength; trailIndex += 1) {
                    const row = headRow - trailIndex;
                    if (row < 0 || row > maxRow) continue;

                    const y = row * rowHeight;
                    const charIndex = (column.offset + headRow + trailIndex + index) % sourceLength;
                    const char = getCmatrixChar(source, charIndex);

                    if (trailIndex === 0) {
                        ctx.fillStyle = "#f3e7c2";
                    } else if (trailIndex < 3) {
                        ctx.fillStyle = `rgba(233, 219, 180, ${0.92 - (trailIndex * 0.18)})`;
                    } else {
                        const alpha = Math.max(0.08, 0.72 - ((trailIndex / trailLength) * 0.74));
                        ctx.fillStyle = `rgba(203, 184, 140, ${alpha})`;
                    }

                    ctx.fillText(char, x, y);
                }

                column.head += column.speed * step;
                if (Math.random() < 0.012 * step) {
                    column.offset = (column.offset + 1 + Math.floor(Math.random() * 3)) % sourceLength;
                }

                if ((headRow - trailLength) > (maxRow + 4)) {
                    respawnCmatrixColumn(instance, index);
                }
            });
        });
    }

    function cmatrixTick(now) {
        if (!cmatrixActive) {
            cmatrixFrame = null;
            cmatrixLastTime = 0;
            return;
        }

        if (!cmatrixLastTime) {
            cmatrixLastTime = now;
        }

        const deltaMs = Math.min(48, now - cmatrixLastTime || 16.6667);
        cmatrixLastTime = now;
        renderCmatrixFrame(deltaMs);
        cmatrixFrame = window.requestAnimationFrame(cmatrixTick);
    }

    function startCmatrix() {
        if (cmatrixActive) {
            appendTerminalOutput("cmatrix: already running");
            return;
        }

        cmatrixActive = true;
        cmatrixLastTime = 0;

        terminalInstances.forEach((instance) => {
            ensureCmatrixLayer(instance);
            instance.shell.classList.add("is-cmatrix");
            instance.shell.scrollTop = 0;
            instance.matrixSource = buildCmatrixSource(instance);
            resizeCmatrixLayer(instance);
            const ctx = instance.matrixContext;
            if (ctx && instance.matrixWidth && instance.matrixHeight) {
                ctx.fillStyle = "#050505";
                ctx.fillRect(0, 0, instance.matrixWidth, instance.matrixHeight);
            }
        });

        if (cmatrixFrame !== null) {
            window.cancelAnimationFrame(cmatrixFrame);
        }
        cmatrixFrame = window.requestAnimationFrame(cmatrixTick);
    }

    function stopCmatrix() {
        if (!cmatrixActive) return;

        cmatrixActive = false;
        cmatrixLastTime = 0;
        if (cmatrixFrame !== null) {
            window.cancelAnimationFrame(cmatrixFrame);
            cmatrixFrame = null;
        }

        terminalInstances.forEach((instance) => {
            instance.shell.classList.remove("is-cmatrix");
            if (instance.matrixContext && instance.matrixWidth && instance.matrixHeight) {
                instance.matrixContext.clearRect(0, 0, instance.matrixWidth, instance.matrixHeight);
            }
        });
        syncTerminalScroll();
    }

    function renderView() {
        const nextView = getActiveView();
        const enteringView = getEnteringView(nextView);
        const entranceClass = getEntranceClass(activeView, nextView);

        pageNodes.forEach((node) => {
            if (node.element) {
                node.element.hidden = node.name !== nextView;
            }
        });

        renderNavigation(nextView);

        if (nextView === "grid") {
            requestSync();
            requestAnimationFrame(() => requestAnimationFrame(() => focusTerminal("grid")));
        } else {
            if (nextView === "home") {
                requestAnimationFrame(resetLetterLayout);
            }
            requestAnimationFrame(() => focusTerminal(nextView));
        }

        if (hasRendered && nextView !== activeView && enteringView) {
            window.scrollTo(0, 0);
            enteringView.classList.remove("is-entering-from-right", "is-entering-from-left");
            void enteringView.offsetWidth;
            enteringView.classList.add(entranceClass);
            enteringView.addEventListener("animationend", () => {
                enteringView.classList.remove(entranceClass);
            }, { once: true });
        }

        activeView = nextView;
        hasRendered = true;
    }

    function focusTerminal(viewName = activeView) {
        const instance = getPreferredTerminalInstance(viewName) || terminalInstances.find(isTerminalInstanceVisible);
        if (!isTerminalInstanceVisible(instance)) return;

        activeTerminalShell = instance.shell;
        if (instance.capture) {
            instance.capture.value = terminalBuffer;
        }
        try {
            (instance.capture || instance.shell).focus({ preventScroll: true });
        } catch (error) {
            (instance.capture || instance.shell).focus();
        }
        if (instance.capture && typeof instance.capture.setSelectionRange === "function") {
            const end = instance.capture.value.length;
            instance.capture.setSelectionRange(end, end);
        }
        syncTerminalScroll();
    }

    function syncTerminalScroll() {
        terminalInstances.forEach((instance) => {
            instance.shell.scrollTop = instance.shell.scrollHeight;
        });
    }

    function renderTerminal() {
        terminalInstances.forEach((instance) => {
            if (!instance.history || !instance.input) return;

            instance.history.textContent = "";

            terminalTranscript.forEach((entry) => {
                if (entry.type === "command") {
                    const line = document.createElement("div");
                    const prompt = document.createElement("span");
                    const content = document.createElement("span");

                    line.className = "terminal-entry";
                    prompt.className = "terminal-prompt";
                    content.className = "terminal-command";
                    prompt.textContent = terminalPrompt;
                    content.textContent = entry.text;
                    line.appendChild(prompt);
                    line.appendChild(content);
                    instance.history.appendChild(line);
                    return;
                }

                const output = document.createElement("div");
                output.className = "terminal-output";
                output.textContent = entry.text;
                instance.history.appendChild(output);
            });

            instance.input.textContent = terminalBuffer;
            if (instance.capture && instance.capture.value !== terminalBuffer) {
                instance.capture.value = terminalBuffer;
            }
        });

        syncTerminalScroll();
    }

    function appendTerminalEntry(command) {
        terminalTranscript.push({
            type: "command",
            text: command,
        });
        renderTerminal();
    }

    function appendTerminalOutput(text) {
        terminalTranscript.push({
            type: "output",
            text,
        });
        renderTerminal();
    }

    function clearTerminalHistory() {
        terminalTranscript = [];
        renderTerminal();
    }

    function getDirectoryEntries() {
        if (currentDirectory === "~") {
            return getPageNamesInOrder().map((name) => `${name}/`);
        }

        if (currentDirectory === "grid") {
            return [
                "terminal@00-0A",
                `source:${getCatalogSourceLabel()}`,
                `filter:${describeTileFilter()}`,
                ...getKnownTileTypes().map((type) => `${type}/`),
            ];
        }

        const page = getPageNode(currentDirectory);
        if (page?.editable) {
            return [
                "tittle",
                "description",
            ];
        }

        return [];
    }

    function parseEchoAssignment(rawCommand) {
        const match = rawCommand.match(/^echo\s+([a-zA-Z][\w-]*)\s*>\s*(?:"([^\"]*)"|'([^']*)'|(.*))$/);
        if (!match) return null;

        const value = match[2] ?? match[3] ?? (match[4] || "").trim();
        return {
            target: match[1].toLowerCase(),
            value,
        };
    }

    function parseMkdirTarget(rawCommand) {
        const match = rawCommand.match(/^mkdir\s+(?:"([^\"]+)"|'([^']+)'|([^\s]+))$/);
        if (!match) return null;

        const rawName = (match[1] ?? match[2] ?? match[3] ?? "").trim();
        const name = rawName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        if (!name) return null;

        const titleText = rawName
            .split(/[\s_-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");

        return {
            name,
            titleText: titleText || rawName,
        };
    }

    function parsePageCommandTarget(rawCommand, commandName) {
        const pattern = new RegExp(`^${commandName}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))$`);
        const match = rawCommand.match(pattern);
        if (!match) return null;

        return (match[1] ?? match[2] ?? match[3] ?? "")
            .trim()
            .toLowerCase()
            .replace(/\/+$/, "");
    }

    function updatePageContent(pageName, target, value) {
        const page = getPageNode(pageName);
        if (!page || !page.editable) {
            return false;
        }

        const normalizedTarget = target === "title" ? "tittle" : target;

        if (normalizedTarget === "tittle") {
            const nextTitle = value || " ";
            page.titleText = nextTitle;

            if (page.kind === "home") {
                homeTitleText = nextTitle;
                if (homeStage) {
                    homeStage.setAttribute("aria-label", nextTitle.trim() || " ");
                }
                if (homeTitleLabel) {
                    homeTitleLabel.textContent = nextTitle;
                }
                buildWelcomeLetters();
            } else if (page.titleEl) {
                page.titleEl.textContent = nextTitle;
            }

            return true;
        }

        if (normalizedTarget === "description") {
            page.descriptionText = value;
            if (page.descriptionEl) {
                page.descriptionEl.textContent = value;
            }
            return true;
        }

        return false;
    }

    function isTerminalInputActive() {
        return Boolean(
            activeTerminalShell &&
            activeTerminalShell.contains(document.activeElement) &&
            !activeTerminalShell.closest("[hidden]")
        );
    }

    function applyTileFilter(filter, options = {}) {
        tileFilter = filter;

        if (options.navigate !== false && activeView !== "grid") {
            window.location.hash = "#grid";
            return;
        }

        requestSync();
    }

    function runTerminalCommand(rawCommand) {
        const trimmed = rawCommand.trim();

        if (!trimmed) {
            return;
        }

        const [command, ...args] = trimmed.split(/\s+/);
        const normalized = command.toLowerCase();

        switch (normalized) {
            case "help":
                appendTerminalOutput([
                    "Available commands:",
                    "clear",
                    "ls",
                    "cd",
                    "mkdir",
                    "rm",
                    "tree",
                    "echo",
                    "search",
                    "cmatrix",
                    "help",
                ].join("\n"));
                break;
            case "clear":
                clearTerminalHistory();
                break;
            case "ls":
                appendTerminalOutput(getDirectoryEntries().join("\n") || "empty");
                break;
            case "cd": {
                const target = (args[0] || "").toLowerCase();
                if (!target) {
                    appendTerminalOutput("usage: cd [page|..|~]");
                    break;
                }
                if (target === ".." || target === "~") {
                    currentDirectory = "~";
                    break;
                }

                if (getPageNode(target)) {
                    currentDirectory = target;
                    window.location.hash = `#${target}`;
                    break;
                }

                appendTerminalOutput(`cd: no such location: ${args[0]}`);
                break;
            }
            case "mkdir": {
                const target = parseMkdirTarget(trimmed);
                if (!target) {
                    appendTerminalOutput('usage: mkdir [name] or mkdir "page name"');
                    break;
                }
                if (getPageNode(target.name)) {
                    appendTerminalOutput(`mkdir: ${target.name}: already exists`);
                    break;
                }

                const pageNode = createDynamicPage(target.name, target.titleText);
                insertPageNodeAfter(activeView, pageNode);
                renderNavigation(activeView);
                renderTerminal();
                appendTerminalOutput(`mkdir: created ${target.name}/`);
                break;
            }
            case "rm": {
                const target = parsePageCommandTarget(trimmed, "rm");
                if (!target) {
                    appendTerminalOutput("usage: rm [page]");
                    break;
                }

                const page = getPageNode(target);
                if (!page) {
                    appendTerminalOutput(`rm: ${target}: no such page`);
                    break;
                }

                if (page.kind !== "dynamic") {
                    appendTerminalOutput(`rm: ${target}: built-in pages cannot be removed`);
                    break;
                }

                const fallbackView = page.prev || page.next || "home";
                removePageNode(target);
                appendTerminalOutput(`rm: removed ${target}/`);
                renderNavigation(activeView === target ? fallbackView : activeView);

                if (currentDirectory === target) {
                    currentDirectory = "~";
                }

                if (activeView === target) {
                    window.location.hash = `#${fallbackView}`;
                }
                break;
            }
            case "tree":
                appendTerminalOutput(buildTreeOutput());
                break;
            case "search": {
                const search = parseSearchCommand(trimmed);
                if (search.error) {
                    appendTerminalOutput(search.error);
                    break;
                }

                applyTileFilter(search);
                appendTerminalOutput(formatSearchSummary());
                break;
            }
            case "cmatrix":
                startCmatrix();
                break;
            case "echo": {
                const assignment = parseEchoAssignment(trimmed);
                if (!assignment) {
                    appendTerminalOutput('usage: echo [field] > "value"');
                    break;
                }
                if (!getPageNode(currentDirectory)?.editable) {
                    appendTerminalOutput("echo: no editable fields in this directory");
                    break;
                }
                if (!updatePageContent(currentDirectory, assignment.target, assignment.value)) {
                    appendTerminalOutput(`echo: unknown field: ${assignment.target}`);
                }
                break;
            }
            default:
                appendTerminalOutput(`${command}: command not found`);
        }
    }

    function handleTerminalKeydown(event) {
        if (!isTerminalInputActive()) return;
        if (event.target instanceof HTMLElement && event.target.closest(".terminal-capture")) return;
        if (cmatrixActive) {
            if (event.key === "Escape" || event.key === "Esc") {
                event.preventDefault();
                stopCmatrix();
                return;
            }

            if (event.ctrlKey && event.key.toLowerCase() === "c") {
                event.preventDefault();
                stopCmatrix();
                return;
            }

            if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "q") {
                event.preventDefault();
                stopCmatrix();
                return;
            }

            event.preventDefault();
            return;
        }

        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === "Backspace") {
            event.preventDefault();
            terminalBuffer = terminalBuffer.slice(0, -1);
            renderTerminal();
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            appendTerminalEntry(terminalBuffer);
            runTerminalCommand(terminalBuffer);
            terminalBuffer = "";
            renderTerminal();
            return;
        }

        if (event.key === "Tab") {
            event.preventDefault();
            terminalBuffer += "    ";
            renderTerminal();
            return;
        }

        if (event.key.length === 1) {
            event.preventDefault();
            terminalBuffer += event.key;
            renderTerminal();
        }
    }

    function showCursorInvert(clientX, clientY) {
        if (invertHideTimer !== null) {
            window.clearTimeout(invertHideTimer);
            invertHideTimer = null;
        }
        root.style.setProperty("--cursor-x", `${clientX}px`);
        root.style.setProperty("--cursor-y", `${clientY}px`);
        root.style.setProperty("--invert-opacity", "1");
    }

    function hideCursorInvert(delay = 0) {
        if (invertHideTimer !== null) {
            window.clearTimeout(invertHideTimer);
            invertHideTimer = null;
        }

        if (delay > 0) {
            invertHideTimer = window.setTimeout(() => {
                root.style.setProperty("--invert-opacity", "0");
                invertHideTimer = null;
            }, delay);
            return;
        }

        root.style.setProperty("--invert-opacity", "0");
    }

    function getColumnCount(width) {
        if (width < 560) return 1;
        if (width < 900) return 2;
        return Math.max(3, Math.min(7, Math.round(width / 320)));
    }

    function getMetrics() {
        const styles = getComputedStyle(grid);
        const gap = parseFloat(styles.gap) || 0;
        const width = window.innerWidth;
        const headerHeight = titleBar ? titleBar.getBoundingClientRect().height : 0;
        const height = Math.max(0, window.innerHeight - headerHeight);
        const cols = getColumnCount(width);
        const cellSize = (width - gap * (cols - 1)) / cols;

        return { gap, width, height, cols, cellSize };
    }

    function applyBubbleSpan(bubble, cols) {
        const colSpan = Math.max(1, Math.min(cols, Number(bubble.dataset.colSpan) || 1));
        const rowSpan = Math.max(1, Number(bubble.dataset.rowSpan) || 1);
        const cellSize = Number(grid.dataset.cellSize) || 0;
        const label = bubble.querySelector(".bubble__label");
        const labelSize = Math.max(11, Math.min(20, cellSize * 0.1));

        bubble.dataset.colSpan = String(colSpan);
        bubble.dataset.rowSpan = String(rowSpan);
        bubble.style.gridColumn = `auto / span ${colSpan}`;
        bubble.style.gridRow = `auto / span ${rowSpan}`;

        if (label) {
            label.style.fontSize = `${labelSize}px`;
        }
    }

    function getBubbleTitle(index) {
        const cycle = Math.floor(index / 26);
        const letter = String.fromCharCode(65 + (index % 26));
        return `${String(cycle).padStart(2, "0")}-0${letter}`;
    }

    function attachResize(bubble, handle) {
        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();

            const startMetrics = getMetrics();
            const startX = event.clientX;
            const startY = event.clientY;
            const startCols = Number(bubble.dataset.colSpan) || 1;
            const startRows = Number(bubble.dataset.rowSpan) || 1;
            const trackSize = startMetrics.cellSize + startMetrics.gap;
            const step = Math.max(24, trackSize * 0.35);

            document.body.classList.add("is-resizing");
            bubble.classList.add("is-resizing");
            handle.setPointerCapture(event.pointerId);

            function onPointerMove(moveEvent) {
                const deltaCols = Math.round((moveEvent.clientX - startX) / step);
                const deltaRows = Math.round((moveEvent.clientY - startY) / step);
                const nextColSpan = Math.max(1, Math.min(startMetrics.cols, startCols + deltaCols));
                const nextRowSpan = Math.max(1, startRows + deltaRows);

                bubble.dataset.colSpan = String(nextColSpan);
                bubble.dataset.rowSpan = String(nextRowSpan);
                applyBubbleSpan(bubble, startMetrics.cols);
            }

            function stopResize() {
                document.body.classList.remove("is-resizing");
                bubble.classList.remove("is-resizing");
                document.removeEventListener("pointermove", onPointerMove);
                document.removeEventListener("pointerup", stopResize);
                document.removeEventListener("pointercancel", stopResize);
                requestSync();
            }

            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", stopResize);
            document.addEventListener("pointercancel", stopResize);
        });
    }

    function createTerminalShell(viewName, titleId, titleText, variantClass) {
        const shell = document.createElement("div");
        const title = document.createElement("h2");
        const history = document.createElement("div");
        const line = document.createElement("div");
        const prompt = document.createElement("span");
        const input = document.createElement("span");
        const cursor = document.createElement("span");

        shell.className = `terminal-shell ${variantClass}`;
        shell.dataset.terminalShell = "";
        shell.dataset.terminalView = viewName;
        shell.tabIndex = 0;
        shell.setAttribute("role", "textbox");
        shell.setAttribute("aria-multiline", "true");
        shell.setAttribute("aria-labelledby", titleId);

        title.id = titleId;
        title.className = "sr-only";
        title.textContent = titleText;

        history.className = "terminal-history";
        history.dataset.terminalHistory = "";
        history.setAttribute("aria-live", "polite");

        line.className = "terminal-line";

        prompt.className = "terminal-prompt";
        prompt.textContent = terminalPrompt;

        input.className = "terminal-input";
        input.dataset.terminalInput = "";

        cursor.className = "terminal-cursor";
        cursor.setAttribute("aria-hidden", "true");

        line.appendChild(prompt);
        line.appendChild(input);
        line.appendChild(cursor);

        shell.appendChild(title);
        shell.appendChild(history);
        shell.appendChild(line);

        registerTerminalInstance(shell);

        return shell;
    }

    function createGridTerminalShell() {
        return createTerminalShell("grid", "grid-terminal-title", "Grid terminal", "terminal-shell--bubble");
    }

    function createDynamicPage(pageName, titleText) {
        const section = document.createElement("section");
        const layout = document.createElement("div");
        const aside = document.createElement("aside");
        const copy = document.createElement("div");
        const title = document.createElement("h1");
        const description = document.createElement("p");

        section.id = `${pageName}-view`;
        section.className = "catalog-view dynamic-page page-view";
        section.hidden = true;

        layout.className = "catalog-view__layout";
        aside.className = "catalog-view__terminal";
        copy.className = "catalog-view__copy";

        title.id = `${pageName}-title`;
        title.className = "dynamic-page__title";
        title.textContent = titleText;

        description.id = `${pageName}-description`;
        description.className = "dynamic-page__description";
        description.textContent = "This page is empty.";

        section.setAttribute("aria-labelledby", title.id);

        aside.appendChild(
            createTerminalShell(
                pageName,
                `${pageName}-terminal-title`,
                `${titleText} terminal`,
                "terminal-shell--sidebar"
            )
        );
        copy.appendChild(title);
        copy.appendChild(description);
        layout.appendChild(aside);
        layout.appendChild(copy);
        section.appendChild(layout);

        return createPageNode(pageName, section, {
            editable: true,
            kind: "dynamic",
            titleEl: title,
            descriptionEl: description,
            titleText,
            descriptionText: description.textContent,
        });
    }

    function ensureGridTerminalBubble() {
        const bubble = grid.firstElementChild;
        if (!(bubble instanceof HTMLElement)) return;

        bubble.classList.add("bubble--terminal");
        bubble.classList.remove("bubble--content", "bubble--empty");
        bubble.dataset.tileId = "__terminal__";
        bubble.dataset.tileType = "terminal";
        bubble.dataset.previewMode = "none";
        clearBubbleAction(bubble);

        let shell = bubble.querySelector("[data-terminal-shell]");
        if (!shell) {
            shell = createGridTerminalShell();
            bubble.appendChild(shell);
        } else {
            registerTerminalInstance(shell);
        }
    }

    function createBubble(cols) {
        const bubble = document.createElement("article");
        const label = document.createElement("span");
        const content = document.createElement("div");
        const kind = document.createElement("span");
        const title = document.createElement("h2");
        const preview = document.createElement("div");
        const summary = document.createElement("p");
        const source = document.createElement("p");
        const tags = document.createElement("div");
        const handle = document.createElement("button");

        bubble.className = "bubble";
        bubble.dataset.colSpan = "1";
        bubble.dataset.rowSpan = "1";
        bubble.tabIndex = -1;

        label.className = "bubble__label";
        label.textContent = "00-0A";
        label.setAttribute("aria-hidden", "true");

        content.className = "bubble__content";
        kind.className = "bubble__kind";
        title.className = "bubble__title";
        preview.className = "bubble__preview";
        preview.hidden = true;
        summary.className = "bubble__summary";
        source.className = "bubble__source";
        tags.className = "bubble__tags";

        content.appendChild(kind);
        content.appendChild(title);
        content.appendChild(preview);
        content.appendChild(summary);
        content.appendChild(source);
        content.appendChild(tags);

        handle.className = "bubble__handle";
        handle.type = "button";
        handle.setAttribute("aria-label", "Resize bubble");

        bubble.appendChild(label);
        bubble.appendChild(content);
        bubble.appendChild(handle);
        attachResize(bubble, handle);
        applyBubbleSpan(bubble, cols);

        return bubble;
    }

    function openTile(tile) {
        if (!tile?.href || tile.virtual) return;
        window.open(tile.href, "_blank", "noopener,noreferrer");
    }

    function clearBubbleAction(bubble) {
        bubble.classList.remove("bubble--link");
        bubble.removeAttribute("data-href");
        bubble.removeAttribute("role");
        bubble.removeAttribute("aria-label");
        bubble.tabIndex = -1;
        bubble.onclick = null;
        bubble.onkeydown = null;
    }

    function attachBubbleAction(bubble, tile) {
        clearBubbleAction(bubble);

        if (!tile?.href || tile.virtual) {
            return;
        }

        bubble.classList.add("bubble--link");
        bubble.dataset.href = tile.href;
        bubble.setAttribute("role", "link");
        bubble.setAttribute("aria-label", `Open ${tile.title}`);
        bubble.tabIndex = 0;
        bubble.onclick = (event) => {
            if (event.target instanceof HTMLElement && event.target.closest(".bubble__handle")) {
                return;
            }

            const previewMode = bubble.dataset.previewMode || "none";
            const previewIsScrollable = previewMode === "text" || previewMode === "code" || previewMode === "markdown";
            if (previewIsScrollable && event.target instanceof HTMLElement && event.target.closest(".bubble__preview")) {
                return;
            }

            openTile(tile);
        };
        bubble.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openTile(tile);
        };
    }

    function renderTilePreview(previewEl, tile) {
        if (!previewEl) return;

        previewEl.className = "bubble__preview";
        previewEl.textContent = "";
        previewEl.replaceChildren();

        const mode = getTilePreviewMode(tile);
        if (mode === "none") {
            previewEl.hidden = true;
            return;
        }

        previewEl.hidden = false;
        const cached = tilePreviewCache.get(tile.id);

        if (!cached) {
            previewEl.classList.add("bubble__preview--loading");
            previewEl.textContent = mode === "pdf" ? "PDF document" : "Loading preview...";
            scheduleTilePreview(tile, mode);
            return;
        }

        if (cached.state === "loading") {
            previewEl.classList.add("bubble__preview--loading");
            previewEl.textContent = mode === "pdf" ? "PDF document" : "Loading preview...";
            return;
        }

        if (cached.state === "error") {
            previewEl.classList.add("bubble__preview--error");
            previewEl.textContent = "Preview unavailable";
            return;
        }

        previewEl.classList.add(`bubble__preview--${cached.mode}`);

        if (cached.mode === "image") {
            const image = document.createElement("img");
            image.className = "bubble__preview-image";
            image.src = cached.src;
            image.alt = `${tile.title} preview`;
            image.loading = "lazy";
            image.decoding = "async";
            previewEl.appendChild(image);
            return;
        }

        if (cached.mode === "pdf") {
            const badge = document.createElement("span");
            badge.className = "bubble__preview-badge";
            badge.textContent = tile.size > 0
                ? `PDF · ${Math.max(1, Math.round(tile.size / 1024))} KB`
                : "PDF document";
            previewEl.appendChild(badge);
            return;
        }

        if (cached.mode === "markdown") {
            const markdown = document.createElement("div");
            markdown.className = "bubble__preview-markdown";
            markdown.innerHTML = cached.html;
            previewEl.appendChild(markdown);
            return;
        }

        const snippet = document.createElement("pre");
        snippet.className = "bubble__preview-text";
        snippet.textContent = cached.text;
        previewEl.appendChild(snippet);
    }

    function scheduleTilePreview(tile, mode = getTilePreviewMode(tile)) {
        if (!tile?.id || mode === "none") return;
        if (tilePreviewCache.has(tile.id) || tilePreviewRequests.has(tile.id)) return;

        if (mode === "image") {
            tilePreviewCache.set(tile.id, {
                state: "ready",
                mode,
                src: tile.href,
            });
            requestSync();
            return;
        }

        if (mode === "pdf") {
            tilePreviewCache.set(tile.id, {
                state: "ready",
                mode,
            });
            requestSync();
            return;
        }

        tilePreviewCache.set(tile.id, {
            state: "loading",
            mode,
        });

        const previewUrl = tile.previewHref || tile.href;
        const request = fetch(previewUrl, {
            headers: {
                accept: "application/json, text/plain, text/markdown, text/javascript, */*",
            },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`preview request failed: ${response.status}`);
                }
                const responseType = normalizeMimeType(response.headers.get("content-type"));
                if (responseType === "application/json") {
                    return response.json().then((payload) => String(payload?.text || ""));
                }
                return response.text();
            })
            .then((text) => {
                tilePreviewCache.set(tile.id, {
                    state: "ready",
                    mode,
                    text: mode === "markdown" ? "" : buildTextPreviewSnippet(text, mode),
                    html: mode === "markdown" ? renderMarkdownPreviewHtml(text) : "",
                });
                requestSync();
            })
            .catch(() => {
                tilePreviewCache.set(tile.id, {
                    state: "error",
                    mode,
                });
                requestSync();
            })
            .finally(() => {
                tilePreviewRequests.delete(tile.id);
            });

        tilePreviewRequests.set(tile.id, request);
    }

    function renderBubbleTags(container, tags) {
        if (!container) return;

        container.textContent = "";
        tags.slice(0, 3).forEach((tag) => {
            const chip = document.createElement("span");
            chip.className = "bubble__tag";
            chip.textContent = tag;
            container.appendChild(chip);
        });
    }

    function renderCatalogBubble(bubble, tile, slotIndex) {
        const label = bubble.querySelector(".bubble__label");
        const kind = bubble.querySelector(".bubble__kind");
        const title = bubble.querySelector(".bubble__title");
        const preview = bubble.querySelector(".bubble__preview");
        const summary = bubble.querySelector(".bubble__summary");
        const source = bubble.querySelector(".bubble__source");
        const tags = bubble.querySelector(".bubble__tags");

        bubble.classList.remove("bubble--terminal");
        bubble.classList.add("bubble--content");
        bubble.classList.toggle("bubble--empty", Boolean(tile.virtual));
        bubble.dataset.tileId = tile.id;
        bubble.dataset.tileType = tile.type;
        bubble.dataset.repo = tile.repo;
        bubble.dataset.path = tile.path;
        bubble.dataset.previewMode = getTilePreviewMode(tile);
        attachBubbleAction(bubble, tile);

        if (label) {
            label.textContent = getBubbleTitle(slotIndex);
        }
        if (kind) {
            kind.textContent = tile.type;
        }
        if (title) {
            title.textContent = tile.title;
        }
        renderTilePreview(preview, tile);
        if (summary) {
            summary.textContent = tile.summary;
        }
        if (source) {
            source.textContent = formatTileSource(tile);
        }

        renderBubbleTags(tags, tile.tags || []);
    }

    function syncGrid() {
        if (grid.hidden) return;

        const { cols, cellSize } = getMetrics();
        const visibleTiles = getVisibleCatalogTiles();
        const needed = Math.max(1, visibleTiles.length + 1);

        grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        grid.style.gridAutoRows = `${cellSize}px`;
        grid.dataset.cellSize = String(cellSize);

        Array.from(grid.children).forEach((bubble) => {
            applyBubbleSpan(bubble, cols);
        });

        const current = grid.children.length;

        for (let index = current; index < needed; index += 1) {
            grid.appendChild(createBubble(cols));
        }

        for (let index = current - 1; index >= needed; index -= 1) {
            grid.removeChild(grid.children[index]);
        }

        ensureGridTerminalBubble();

        Array.from(grid.children).forEach((bubble, index) => {
            if (!(bubble instanceof HTMLElement)) return;

            if (index === 0) {
                const label = bubble.querySelector(".bubble__label");
                if (label) {
                    label.textContent = getBubbleTitle(0);
                }
                return;
            }

            const tile = visibleTiles[index - 1];
            if (!tile) return;
            renderCatalogBubble(bubble, tile, index);
        });

        renderTerminal();

        if (activeView === "grid" && (!activeTerminalShell || activeTerminalShell.closest("[hidden]"))) {
            requestAnimationFrame(() => focusTerminal("grid"));
        }
    }

    function requestSync() {
        if (grid.hidden || requestSync.frame !== null) return;
        requestSync.frame = window.requestAnimationFrame(() => {
            requestSync.frame = null;
            syncGrid();
        });
    }
    requestSync.frame = null;

    function applyLetterTransform(body) {
        body.el.style.transform = `translate(${body.x}px, ${body.y}px) rotate(${body.rotation}deg)`;
    }

    function resetLetterLayout() {
        if (!homeStage || !welcomeLetters) return;

        const stageWidth = welcomeStageBounds().width;
        if (stageWidth < 20) return;
        let cursorX = 0;
        const gap = Math.max(0, stageWidth * 0.008);

        welcomeBodies.forEach((body) => {
            body.el.style.transform = "translate(0px, 0px) rotate(0deg)";
            const rect = body.el.getBoundingClientRect();
            body.width = rect.width;
            body.height = rect.height;
        });

        welcomeBodies.forEach((body) => {
            body.homeX = cursorX;
            body.homeY = 0;
            body.x = cursorX;
            body.y = 0;
            body.vx = 0;
            body.vy = 0;
            body.rotation = 0;
            body.angularVelocity = 0;
            body.active = false;
            body.dragging = false;
            body.el.classList.remove("is-dragging");
            applyLetterTransform(body);
            cursorX += body.width + gap;
        });
    }

    function welcomeStageBounds() {
        const rect = homeStage.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    function buildWelcomeLetters() {
        if (!welcomeLetters) return;

        welcomeLetters.textContent = "";
        welcomeBodies.length = 0;

        Array.from(homeTitleText).forEach((character) => {
            const body = {
                el: document.createElement("span"),
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                rotation: 0,
                angularVelocity: 0,
                width: 0,
                height: 0,
                homeX: 0,
                homeY: 0,
                active: false,
                dragging: false,
                dragOffsetX: 0,
                dragOffsetY: 0,
            };

            body.el.className = "welcome-letter";
            body.el.textContent = character === " " ? "\u00A0" : character;
            body.el.setAttribute("aria-hidden", "true");
            body.el.addEventListener("pointerdown", (event) => startLetterDrag(event, body));

            welcomeLetters.appendChild(body.el);
            welcomeBodies.push(body);
        });

        requestAnimationFrame(resetLetterLayout);
    }

    function startLetterDrag(event, body) {
        if (!homeStage || homeView.hidden) return;

        const stageRect = homeStage.getBoundingClientRect();
        dragBody = body;
        dragPointerId = event.pointerId;
        body.active = true;
        body.dragging = true;
        body.vx = 0;
        body.vy = 0;
        body.angularVelocity = 0;
        body.dragOffsetX = event.clientX - stageRect.left - body.x;
        body.dragOffsetY = event.clientY - stageRect.top - body.y;
        body.el.classList.add("is-dragging");
        body.el.setPointerCapture(event.pointerId);
        lastPointerSample = {
            time: performance.now(),
            x: event.clientX,
            y: event.clientY,
        };

        ensurePhysicsLoop();
    }

    function moveDraggedLetter(event) {
        if (!dragBody || event.pointerId !== dragPointerId || !homeStage) return;

        const stageRect = homeStage.getBoundingClientRect();
        const maxX = stageRect.width - dragBody.width;
        const maxY = stageRect.height - dragBody.height;
        const nextX = event.clientX - stageRect.left - dragBody.dragOffsetX;
        const nextY = event.clientY - stageRect.top - dragBody.dragOffsetY;
        const now = performance.now();

        dragBody.x = Math.min(Math.max(0, nextX), Math.max(0, maxX));
        dragBody.y = Math.min(Math.max(0, nextY), Math.max(0, maxY));
        dragBody.rotation += (event.movementX || 0) * 0.08;
        applyLetterTransform(dragBody);

        if (lastPointerSample) {
            const dt = Math.max(16, now - lastPointerSample.time);
            dragBody.vx = ((event.clientX - lastPointerSample.x) / dt) * 1000;
            dragBody.vy = ((event.clientY - lastPointerSample.y) / dt) * 1000;
            dragBody.angularVelocity = dragBody.vx * 0.015;
        }

        lastPointerSample = {
            time: now,
            x: event.clientX,
            y: event.clientY,
        };
    }

    function endLetterDrag(event) {
        if (!dragBody) return;
        if (event && event.pointerId !== undefined && event.pointerId !== dragPointerId) return;

        dragBody.dragging = false;
        dragBody.el.classList.remove("is-dragging");
        dragBody = null;
        dragPointerId = null;
        lastPointerSample = null;
        ensurePhysicsLoop();
    }

    function updateWelcomePhysics(deltaSeconds) {
        if (!homeStage || homeView.hidden) return;

        const stage = welcomeStageBounds();

        welcomeBodies.forEach((body) => {
            if (body.dragging || !body.active) return;

            body.vy += gravity * deltaSeconds;
            body.vx *= 0.997;
            body.angularVelocity *= 0.995;

            body.x += body.vx * deltaSeconds;
            body.y += body.vy * deltaSeconds;
            body.rotation += body.angularVelocity * deltaSeconds;

            if (body.x <= 0) {
                body.x = 0;
                body.vx *= -bounce;
                body.angularVelocity *= -0.5;
            }

            if (body.x + body.width >= stage.width) {
                body.x = Math.max(0, stage.width - body.width);
                body.vx *= -bounce;
                body.angularVelocity *= -0.5;
            }

            if (body.y <= 0) {
                body.y = 0;
                body.vy *= -0.28;
            }

            if (body.y + body.height >= stage.height) {
                body.y = Math.max(0, stage.height - body.height);
                body.vy *= -bounce;
                body.vx *= floorFriction;
            body.angularVelocity *= 0.88;

                if (Math.abs(body.vy) < 22) {
                    body.vy = 0;
                }
                if (Math.abs(body.vx) < 8) {
                    body.vx = 0;
                }
                if (Math.abs(body.angularVelocity) < 4) {
                    body.angularVelocity = 0;
                }
                if (body.vx === 0 && body.vy === 0 && body.angularVelocity === 0) {
                    body.active = false;
                }
            }

            applyLetterTransform(body);
        });
    }

    function physicsTick(now) {
        if (!physicsLastTime) {
            physicsLastTime = now;
        }

        const deltaSeconds = Math.min(0.032, (now - physicsLastTime) / 1000);
        physicsLastTime = now;

        updateWelcomePhysics(deltaSeconds);

        const hasActiveLetters = welcomeBodies.some((body) => body.active || body.dragging);
        if (hasActiveLetters || dragBody) {
            physicsFrame = window.requestAnimationFrame(physicsTick);
        } else {
            physicsFrame = null;
            physicsLastTime = 0;
        }
    }

    function ensurePhysicsLoop() {
        if (physicsFrame !== null) return;
        physicsFrame = window.requestAnimationFrame(physicsTick);
    }

    initializePageChain();
    activeView = getActiveView();
    document.querySelectorAll("[data-terminal-shell]").forEach((shell) => {
        registerTerminalInstance(shell);
    });
    renderView();
    renderTerminal();
    loadTileCatalog();
    buildWelcomeLetters();
    updateTexasTime();
    loadTexasWeather();
    window.setInterval(updateTexasTime, 1000);
    window.setInterval(loadTexasWeather, 30 * 60 * 1000);
    window.addEventListener("resize", () => {
        requestSync();
        resetLetterLayout();
        syncTerminalScroll();
        if (cmatrixActive) {
            terminalInstances.forEach((instance) => resizeCmatrixLayer(instance));
        }
    });
    window.addEventListener("hashchange", renderView);
    document.addEventListener("keydown", handleTerminalKeydown);
    document.addEventListener("pointerdown", (event) => {
        showCursorInvert(event.clientX, event.clientY);
    });
    document.addEventListener("pointermove", (event) => {
        if (!event.pointerType || event.pointerType === "mouse" || event.pressure > 0 || event.buttons > 0) {
            showCursorInvert(event.clientX, event.clientY);
        }
        moveDraggedLetter(event);
    });
    document.addEventListener("pointerup", (event) => {
        endLetterDrag(event);
        if (event.pointerType && event.pointerType !== "mouse") {
            hideCursorInvert(180);
        }
    });
    document.addEventListener("pointercancel", (event) => {
        endLetterDrag(event);
        hideCursorInvert();
    });
    document.addEventListener("pointerleave", hideCursorInvert);
    document.addEventListener("mouseout", (event) => {
        if (!event.relatedTarget) {
            hideCursorInvert();
        }
    });
})();

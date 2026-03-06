(function () {
    const grid = document.getElementById("bubble-grid");
    const homeView = document.getElementById("home-view");
    const terminalView = document.getElementById("terminal-view");
    const homeStage = document.getElementById("home-title");
    const homeTitleLabel = document.getElementById("home-title-label");
    const homeDescription = document.getElementById("home-description");
    const welcomeLetters = document.getElementById("welcome-letters");
    const titleBar = document.querySelector(".title-bar");
    const navLinks = Array.from(document.querySelectorAll(".title-bar__nav a"));
    const pageViews = document.querySelector(".page-views");
    const terminalInstances = [];
    const pageNodes = new Map();
    const root = document.documentElement;
    if (!grid) return;

    const extraScrollScreens = 2;
    const terminalPrompt = "friend@thearkprojects:~$";
    let homeTitleText = homeStage?.getAttribute("aria-label") || "Welcome";
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
            editable: Boolean(options.editable),
            kind: options.kind || "static",
            titleEl: options.titleEl || null,
            titleLabelEl: options.titleLabelEl || null,
            descriptionEl: options.descriptionEl || null,
            titleText: options.titleText || "",
            descriptionText: options.descriptionText || "",
        };
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

    function initializePageChain() {
        appendPageNode(createPageNode("home", homeView, {
            editable: true,
            kind: "home",
            titleEl: homeStage,
            titleLabelEl: homeTitleLabel,
            descriptionEl: homeDescription,
            titleText: homeTitleText,
            descriptionText: homeDescription?.textContent?.trim() || "",
        }));
        appendPageNode(createPageNode("grid", grid, {
            kind: "grid",
        }));
        appendPageNode(createPageNode("terminal", terminalView, {
            kind: "terminal",
        }));
    }

    function updateNavigation(viewName) {
        navLinks.forEach((link) => {
            link.classList.toggle("is-active", link.dataset.view === viewName);
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

        terminalInstances.push(instance);
        return instance;
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

        updateNavigation(nextView);

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
        try {
            instance.shell.focus({ preventScroll: true });
        } catch (error) {
            instance.shell.focus();
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
            document.activeElement === activeTerminalShell &&
            !activeTerminalShell.closest("[hidden]")
        );
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
                    "echo",
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
                renderTerminal();
                appendTerminalOutput(`mkdir: created ${target.name}/`);
                break;
            }
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
        root.style.setProperty("--cursor-x", `${clientX}px`);
        root.style.setProperty("--cursor-y", `${clientY}px`);
        root.style.setProperty("--invert-opacity", "1");
    }

    function hideCursorInvert() {
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
        const handle = document.createElement("button");

        bubble.className = "bubble";
        bubble.dataset.colSpan = "1";
        bubble.dataset.rowSpan = "1";

        label.className = "bubble__label";
        label.textContent = "00-0A";
        label.setAttribute("aria-hidden", "true");

        handle.className = "bubble__handle";
        handle.type = "button";
        handle.setAttribute("aria-label", "Resize bubble");

        bubble.appendChild(label);
        bubble.appendChild(handle);
        attachResize(bubble, handle);
        applyBubbleSpan(bubble, cols);

        return bubble;
    }

    function syncGrid() {
        if (grid.hidden) return;

        const { gap, height, cols, cellSize } = getMetrics();
        const targetHeight = height * (1 + extraScrollScreens);
        const rows = Math.max(1, Math.ceil((targetHeight + gap) / (cellSize + gap)));
        const needed = cols * rows;

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
            const label = bubble.querySelector(".bubble__label");
            if (label) {
                label.textContent = getBubbleTitle(index);
            }
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
    buildWelcomeLetters();
    window.addEventListener("resize", () => {
        requestSync();
        resetLetterLayout();
        syncTerminalScroll();
    });
    window.addEventListener("hashchange", renderView);
    document.addEventListener("keydown", handleTerminalKeydown);
    document.addEventListener("pointermove", (event) => {
        if (!event.pointerType || event.pointerType === "mouse") {
            showCursorInvert(event.clientX, event.clientY);
        }
        moveDraggedLetter(event);
    });
    document.addEventListener("pointerup", endLetterDrag);
    document.addEventListener("pointercancel", endLetterDrag);
    document.addEventListener("pointerleave", hideCursorInvert);
    document.addEventListener("mouseout", (event) => {
        if (!event.relatedTarget) {
            hideCursorInvert();
        }
    });
})();

(function () {
    const grid = document.getElementById("bubble-grid");
    const homeView = document.getElementById("home-view");
    const terminalView = document.getElementById("terminal-view");
    const terminalShell = document.getElementById("terminal-shell");
    const terminalHistory = document.getElementById("terminal-history");
    const terminalInput = document.getElementById("terminal-input");
    const homeStage = document.getElementById("home-title");
    const welcomeLetters = document.getElementById("welcome-letters");
    const titleBar = document.querySelector(".title-bar");
    const navLinks = Array.from(document.querySelectorAll(".title-bar__nav a"));
    const root = document.documentElement;
    if (!grid) return;

    const extraScrollScreens = 2;
    const terminalPrompt = "friend@thearkprojects:~$";
    const welcomeWord = "Welcome";
    const welcomeBodies = [];
    const gravity = 2200;
    const bounce = 0.48;
    const floorFriction = 0.985;
    let activeView = getActiveView();
    let hasRendered = false;
    let dragBody = null;
    let dragPointerId = null;
    let lastPointerSample = null;
    let physicsFrame = null;
    let physicsLastTime = 0;
    let terminalBuffer = "";

    function getActiveView() {
        const hash = window.location.hash.toLowerCase();
        if (hash === "#grid") return "grid";
        if (hash === "#terminal") return "terminal";
        return "home";
    }

    function updateNavigation(viewName) {
        navLinks.forEach((link) => {
            link.classList.toggle("is-active", link.dataset.view === viewName);
        });
    }

    function getEnteringView(viewName) {
        if (viewName === "grid") return grid;
        if (viewName === "terminal") return terminalView;
        return homeView;
    }

    function renderView() {
        const nextView = getActiveView();
        const enteringView = getEnteringView(nextView);
        const entranceClass = nextView === "home" ? "is-entering-from-left" : "is-entering-from-right";

        grid.hidden = nextView !== "grid";
        if (homeView) {
            homeView.hidden = nextView !== "home";
        }
        if (terminalView) {
            terminalView.hidden = nextView !== "terminal";
        }

        updateNavigation(nextView);

        if (nextView === "grid") {
            requestSync();
        } else if (nextView === "home") {
            requestAnimationFrame(resetLetterLayout);
        } else if (nextView === "terminal") {
            requestAnimationFrame(focusTerminal);
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

    function focusTerminal() {
        if (!terminalShell || terminalView.hidden) return;
        terminalShell.focus({ preventScroll: true });
        syncTerminalScroll();
    }

    function syncTerminalScroll() {
        if (!terminalShell) return;
        terminalShell.scrollTop = terminalShell.scrollHeight;
    }

    function renderTerminalInput() {
        if (!terminalInput) return;
        terminalInput.textContent = terminalBuffer;
        syncTerminalScroll();
    }

    function appendTerminalEntry(command) {
        if (!terminalHistory) return;

        const entry = document.createElement("div");
        const prompt = document.createElement("span");
        const content = document.createElement("span");

        entry.className = "terminal-entry";
        prompt.className = "terminal-prompt";
        content.className = "terminal-command";

        prompt.textContent = terminalPrompt;
        content.textContent = command;

        entry.appendChild(prompt);
        entry.appendChild(content);
        terminalHistory.appendChild(entry);
        syncTerminalScroll();
    }

    function appendTerminalOutput(text) {
        if (!terminalHistory) return;

        const output = document.createElement("div");
        output.className = "terminal-output";
        output.textContent = text;
        terminalHistory.appendChild(output);
        syncTerminalScroll();
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
                    "home",
                    "clear",
                    "ls",
                    "cd",
                    "help",
                ].join("\n"));
                break;
            case "clear":
                if (terminalHistory) {
                    terminalHistory.textContent = "";
                }
                break;
            case "home":
                window.location.hash = "#home";
                break;
            case "ls":
                appendTerminalOutput([
                    "home",
                    "grid",
                    "terminal",
                ].join("\n"));
                break;
            case "cd": {
                const target = (args[0] || "").toLowerCase();
                if (!target) {
                    appendTerminalOutput("usage: cd [home|grid|terminal]");
                    break;
                }
                if (target === "home" || target === "~") {
                    window.location.hash = "#home";
                    break;
                }
                if (target === "grid") {
                    window.location.hash = "#grid";
                    break;
                }
                if (target === "terminal") {
                    window.location.hash = "#terminal";
                    break;
                }
                appendTerminalOutput(`cd: no such location: ${args[0]}`);
                break;
            }
            default:
                appendTerminalOutput(`${command}: command not found`);
        }
    }

    function handleTerminalKeydown(event) {
        if (activeView !== "terminal") return;
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === "Backspace") {
            event.preventDefault();
            terminalBuffer = terminalBuffer.slice(0, -1);
            renderTerminalInput();
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            appendTerminalEntry(terminalBuffer);
            runTerminalCommand(terminalBuffer);
            terminalBuffer = "";
            renderTerminalInput();
            return;
        }

        if (event.key === "Tab") {
            event.preventDefault();
            terminalBuffer += "    ";
            renderTerminalInput();
            return;
        }

        if (event.key.length === 1) {
            event.preventDefault();
            terminalBuffer += event.key;
            renderTerminalInput();
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

        Array.from(grid.children).forEach((bubble, index) => {
            const label = bubble.querySelector(".bubble__label");
            if (label) {
                label.textContent = getBubbleTitle(index);
            }
        });
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

        Array.from(welcomeWord).forEach((character) => {
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
            body.el.textContent = character;
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

    renderView();
    renderTerminalInput();
    buildWelcomeLetters();
    window.addEventListener("resize", () => {
        requestSync();
        resetLetterLayout();
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
    if (terminalShell) {
        terminalShell.addEventListener("pointerdown", () => {
            if (activeView === "terminal") {
                focusTerminal();
            }
        });
        terminalShell.addEventListener("paste", (event) => {
            if (activeView !== "terminal") return;
            const pasted = event.clipboardData?.getData("text");
            if (!pasted) return;
            event.preventDefault();
            terminalBuffer += pasted.replace(/\r/g, "");
            renderTerminalInput();
        });
    }
})();

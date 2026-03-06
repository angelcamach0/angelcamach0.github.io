(function () {
    const grid = document.getElementById("bubble-grid");
    const catalogView = document.getElementById("catalog-view");
    const titleBar = document.querySelector(".title-bar");
    const navLinks = Array.from(document.querySelectorAll(".title-bar__nav a"));
    if (!grid) return;

    const extraScrollScreens = 2;

    function getActiveView() {
        return window.location.hash === "#catalog" ? "catalog" : "grid";
    }

    function updateNavigation(activeView) {
        navLinks.forEach((link) => {
            link.classList.toggle("is-active", link.dataset.view === activeView);
        });
    }

    function renderView() {
        const activeView = getActiveView();
        const showGrid = activeView === "grid";

        grid.hidden = !showGrid;
        if (catalogView) {
            catalogView.hidden = showGrid;
        }

        updateNavigation(activeView);

        if (showGrid) {
            requestSync();
        }
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

    let frame = null;

    function requestSync() {
        if (grid.hidden || frame !== null) return;
        frame = window.requestAnimationFrame(() => {
            frame = null;
            syncGrid();
        });
    }

    renderView();
    window.addEventListener("resize", requestSync);
    window.addEventListener("hashchange", renderView);
})();

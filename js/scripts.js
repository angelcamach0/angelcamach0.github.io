(function () {
    const grid = document.getElementById("bubble-grid");
    if (!grid) return;

    const extraScrollScreens = 2;

    function getColumnCount(width) {
        if (width < 560) return 1;
        if (width < 900) return 2;
        return Math.max(3, Math.min(7, Math.round(width / 320)));
    }

    function getMetrics() {
        const styles = getComputedStyle(grid);
        const gap = parseFloat(styles.gap) || 0;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const cols = getColumnCount(width);
        const cellSize = (width - gap * (cols - 1)) / cols;

        return { gap, width, height, cols, cellSize };
    }

    function applyBubbleSpan(bubble, cols) {
        const colSpan = Math.max(1, Math.min(cols, Number(bubble.dataset.colSpan) || 1));
        const rowSpan = Math.max(1, Number(bubble.dataset.rowSpan) || 1);

        bubble.dataset.colSpan = String(colSpan);
        bubble.dataset.rowSpan = String(rowSpan);
        bubble.style.gridColumn = `auto / span ${colSpan}`;
        bubble.style.gridRow = `auto / span ${rowSpan}`;
    }

    function attachResize(bubble, handle) {
        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();

            const startMetrics = getMetrics();
            const startX = event.clientX;
            const startY = event.clientY;
            const startCols = Number(bubble.dataset.colSpan) || 1;
            const startRows = Number(bubble.dataset.rowSpan) || 1;
            const startWidth = startCols * startMetrics.cellSize + startMetrics.gap * (startCols - 1);
            const startHeight = startRows * startMetrics.cellSize + startMetrics.gap * (startRows - 1);
            const trackSize = startMetrics.cellSize + startMetrics.gap;

            bubble.classList.add("is-resizing");
            handle.setPointerCapture(event.pointerId);

            function onPointerMove(moveEvent) {
                const nextWidth = Math.max(startMetrics.cellSize, startWidth + (moveEvent.clientX - startX));
                const nextHeight = Math.max(startMetrics.cellSize, startHeight + (moveEvent.clientY - startY));
                const nextColSpan = Math.max(1, Math.min(startMetrics.cols, Math.round((nextWidth + startMetrics.gap) / trackSize)));
                const nextRowSpan = Math.max(1, Math.round((nextHeight + startMetrics.gap) / trackSize));

                bubble.dataset.colSpan = String(nextColSpan);
                bubble.dataset.rowSpan = String(nextRowSpan);
                applyBubbleSpan(bubble, startMetrics.cols);
            }

            function stopResize() {
                bubble.classList.remove("is-resizing");
                window.removeEventListener("pointermove", onPointerMove);
                window.removeEventListener("pointerup", stopResize);
                window.removeEventListener("pointercancel", stopResize);
                requestSync();
            }

            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", stopResize);
            window.addEventListener("pointercancel", stopResize);
        });
    }

    function createBubble(cols) {
        const bubble = document.createElement("article");
        const handle = document.createElement("button");

        bubble.className = "bubble";
        bubble.dataset.colSpan = "1";
        bubble.dataset.rowSpan = "1";

        handle.className = "bubble__handle";
        handle.type = "button";
        handle.setAttribute("aria-label", "Resize bubble");

        bubble.appendChild(handle);
        attachResize(bubble, handle);
        applyBubbleSpan(bubble, cols);

        return bubble;
    }

    function syncGrid() {
        const { gap, height, cols, cellSize } = getMetrics();
        const targetHeight = height * (1 + extraScrollScreens);
        const rows = Math.max(1, Math.ceil((targetHeight + gap) / (cellSize + gap)));
        const needed = cols * rows;

        grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        grid.style.gridAutoRows = `${cellSize}px`;

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
    }

    let frame = null;

    function requestSync() {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
            frame = null;
            syncGrid();
        });
    }

    syncGrid();
    window.addEventListener("resize", requestSync);
})();

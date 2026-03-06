(function () {
    const grid = document.getElementById("bubble-grid");
    if (!grid) return;

    const extraScrollScreens = 2;

    function getColumnCount(width) {
        if (width < 560) return 1;
        if (width < 900) return 2;
        return Math.max(3, Math.min(7, Math.round(width / 320)));
    }

    function syncGrid() {
        const styles = getComputedStyle(grid);
        const gap = parseFloat(styles.gap) || 0;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const targetHeight = height * (1 + extraScrollScreens);

        const cols = getColumnCount(width);
        const cellSize = (width - gap * (cols - 1)) / cols;
        const rows = Math.max(1, Math.ceil((targetHeight + gap) / (cellSize + gap)));
        const needed = cols * rows;

        grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        grid.style.gridAutoRows = `${cellSize}px`;

        const current = grid.children.length;

        for (let index = current; index < needed; index += 1) {
            const bubble = document.createElement("div");
            bubble.className = "bubble";
            grid.appendChild(bubble);
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

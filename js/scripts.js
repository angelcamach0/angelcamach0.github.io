// Generate responsive bubble grid that fills the viewport area.
(function () {
    const grid = document.getElementById("bubble-grid");
    if (!grid) return;

    const minSize = 120; // minimum target square size in px
    const overscan = 10; // extra cells to avoid gaps during resize

    function fillGrid() {
        const style = getComputedStyle(grid);
        const gap = parseFloat(style.gap) || 0;
        const w = window.innerWidth;
        const h = window.innerHeight;

        const cols = Math.max(1, Math.floor((w + gap) / (minSize + gap)));
        const colSize = (w - gap * (cols - 1)) / cols;
        const rows = Math.max(1, Math.ceil((h + gap) / (colSize + gap)));
        const needed = cols * rows + overscan;
        const current = grid.children.length;

        // Add missing bubbles
        for (let i = current; i < needed; i++) {
            const div = document.createElement("div");
            div.className = "bubble";
            grid.appendChild(div);
        }

        // Remove extras
        for (let i = current - 1; i >= needed; i--) {
            grid.removeChild(grid.children[i]);
        }
    }

    // Initial render
    fillGrid();
    // Debounced resize handling
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fillGrid, 80);
    });
})();

// Generate responsive bubble grid that fills the viewport area.
(function () {
    const grid = document.getElementById("bubble-grid");
    if (!grid) return;

    const targetSize = 130; // px, mid of updated clamp range
    const overscan = 8;     // add a few extra so edges stay filled

    function fillGrid() {
        const w = grid.clientWidth || window.innerWidth;
        const h = window.innerHeight;
        const cols = Math.max(1, Math.round(w / targetSize));
        const rows = Math.max(1, Math.round(h / targetSize));
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

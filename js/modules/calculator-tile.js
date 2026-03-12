function formatDisplayValue(value) {
    if (!Number.isFinite(value)) {
        return "Error";
    }

    const normalized = Number(value.toFixed(10));
    return String(normalized);
}

function createButton(label, options = {}) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "calculator-tile__button";
    button.textContent = label;

    if (options.value !== undefined) {
        button.dataset.value = String(options.value);
    }
    if (options.action) {
        button.dataset.action = options.action;
    }
    if (options.variant) {
        button.classList.add(`calculator-tile__button--${options.variant}`);
    }
    if (options.wide) {
        button.classList.add("calculator-tile__button--wide");
    }

    return button;
}

export function createCalculatorTileController() {
    const root = document.createElement("section");
    const display = document.createElement("output");
    const keys = document.createElement("div");

    let displayValue = "0";
    let storedValue = null;
    let pendingOperator = "";
    let waitingForOperand = false;

    root.className = "calculator-tile";
    root.tabIndex = -1;
    root.setAttribute("aria-label", "Calculator");

    display.className = "calculator-tile__display";
    display.setAttribute("aria-live", "polite");

    keys.className = "calculator-tile__keys";

    [
        createButton("AC", { action: "clear", variant: "muted" }),
        createButton("+/-", { action: "sign", variant: "muted" }),
        createButton("%", { action: "percent", variant: "muted" }),
        createButton("/", { action: "operator", value: "/" }),
        createButton("7", { action: "digit", value: "7" }),
        createButton("8", { action: "digit", value: "8" }),
        createButton("9", { action: "digit", value: "9" }),
        createButton("*", { action: "operator", value: "*" }),
        createButton("4", { action: "digit", value: "4" }),
        createButton("5", { action: "digit", value: "5" }),
        createButton("6", { action: "digit", value: "6" }),
        createButton("-", { action: "operator", value: "-" }),
        createButton("1", { action: "digit", value: "1" }),
        createButton("2", { action: "digit", value: "2" }),
        createButton("3", { action: "digit", value: "3" }),
        createButton("+", { action: "operator", value: "+" }),
        createButton("0", { action: "digit", value: "0", wide: true }),
        createButton(".", { action: "decimal" }),
        createButton("=", { action: "equals", variant: "accent" }),
    ].forEach((button) => {
        keys.appendChild(button);
    });

    root.appendChild(display);
    root.appendChild(keys);

    function updateDisplay() {
        display.value = displayValue;
        display.textContent = displayValue;
    }

    function clearAll() {
        displayValue = "0";
        storedValue = null;
        pendingOperator = "";
        waitingForOperand = false;
        updateDisplay();
    }

    function setErrorState() {
        displayValue = "Error";
        storedValue = null;
        pendingOperator = "";
        waitingForOperand = true;
        updateDisplay();
    }

    function normalizeInputValue() {
        const parsed = Number(displayValue);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function inputDigit(digit) {
        if (displayValue === "Error") {
            displayValue = digit;
            waitingForOperand = false;
            updateDisplay();
            return;
        }

        if (waitingForOperand) {
            displayValue = digit;
            waitingForOperand = false;
        } else {
            displayValue = displayValue === "0" ? digit : `${displayValue}${digit}`;
        }

        updateDisplay();
    }

    function inputDecimal() {
        if (displayValue === "Error") {
            displayValue = "0.";
            waitingForOperand = false;
            updateDisplay();
            return;
        }

        if (waitingForOperand) {
            displayValue = "0.";
            waitingForOperand = false;
            updateDisplay();
            return;
        }

        if (!displayValue.includes(".")) {
            displayValue = `${displayValue}.`;
            updateDisplay();
        }
    }

    function backspace() {
        if (displayValue === "Error" || waitingForOperand) {
            clearAll();
            return;
        }

        displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : "0";
        if (displayValue === "-" || displayValue === "-0") {
            displayValue = "0";
        }
        updateDisplay();
    }

    function toggleSign() {
        if (displayValue === "0" || displayValue === "Error") return;
        displayValue = displayValue.startsWith("-") ? displayValue.slice(1) : `-${displayValue}`;
        updateDisplay();
    }

    function applyPercent() {
        if (displayValue === "Error") return;
        displayValue = formatDisplayValue(normalizeInputValue() / 100);
        updateDisplay();
    }

    function calculate(left, right, operator) {
        switch (operator) {
            case "+":
                return left + right;
            case "-":
                return left - right;
            case "*":
                return left * right;
            case "/":
                return right === 0 ? Number.NaN : left / right;
            default:
                return right;
        }
    }

    function handleOperator(nextOperator) {
        if (displayValue === "Error") {
            clearAll();
            return;
        }

        const inputValue = normalizeInputValue();

        if (storedValue === null || pendingOperator === "") {
            storedValue = inputValue;
        } else if (!waitingForOperand) {
            const nextValue = calculate(storedValue, inputValue, pendingOperator);
            if (!Number.isFinite(nextValue)) {
                setErrorState();
                return;
            }
            storedValue = nextValue;
            displayValue = formatDisplayValue(nextValue);
        }

        waitingForOperand = true;
        pendingOperator = nextOperator === "=" ? "" : nextOperator;
        updateDisplay();
    }

    function handleAction(action, value = "") {
        switch (action) {
            case "digit":
                inputDigit(value);
                break;
            case "decimal":
                inputDecimal();
                break;
            case "operator":
                handleOperator(value);
                break;
            case "equals":
                handleOperator("=");
                break;
            case "clear":
                clearAll();
                break;
            case "sign":
                toggleSign();
                break;
            case "percent":
                applyPercent();
                break;
            case "backspace":
                backspace();
                break;
            default:
                break;
        }
    }

    root.addEventListener("click", (event) => {
        const button = event.target instanceof HTMLElement ? event.target.closest(".calculator-tile__button") : null;
        if (!(button instanceof HTMLButtonElement)) return;

        handleAction(button.dataset.action || "", button.dataset.value || "");
    });

    root.addEventListener("keydown", (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (/^\d$/.test(event.key)) {
            event.preventDefault();
            handleAction("digit", event.key);
            return;
        }

        if (event.key === ".") {
            event.preventDefault();
            handleAction("decimal");
            return;
        }

        if (["+", "-", "*", "/"].includes(event.key)) {
            event.preventDefault();
            handleAction("operator", event.key);
            return;
        }

        if (event.key === "Enter" || event.key === "=") {
            event.preventDefault();
            handleAction("equals");
            return;
        }

        if (event.key === "Backspace") {
            event.preventDefault();
            handleAction("backspace");
            return;
        }

        if (event.key === "Escape" || event.key.toLowerCase() === "c") {
            event.preventDefault();
            handleAction("clear");
        }
    });

    updateDisplay();

    return {
        mount(container) {
            if (!container) return;

            if (root.parentElement !== container) {
                container.textContent = "";
                container.replaceChildren(root);
            }
            updateDisplay();
        },
        focus() {
            try {
                root.focus({ preventScroll: true });
            } catch {
                root.focus();
            }
        },
    };
}

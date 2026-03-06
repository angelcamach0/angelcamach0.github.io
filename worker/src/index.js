const ALLOWED_TYPES = new Set([
    "code",
    "guide",
    "post",
    "journal",
    "note",
    "doc",
]);

const META_FILENAME = "meta.json";

function buildCorsHeaders(extraHeaders = {}) {
    const headers = new Headers(extraHeaders);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    return headers;
}

function jsonResponse(payload, init = {}) {
    const headers = buildCorsHeaders(init.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(payload, null, 2), {
        ...init,
        headers,
    });
}

function textResponse(body, init = {}) {
    const headers = buildCorsHeaders(init.headers);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(body, {
        ...init,
        headers,
    });
}

function normalizeSlug(value, fallback = "item") {
    const slug = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || fallback;
}

function titleFromSlug(slug) {
    return String(slug || "Untitled")
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function normalizeTags(tags, type) {
    const values = Array.isArray(tags)
        ? tags
            .map((tag) => String(tag || "").trim().toLowerCase())
            .filter(Boolean)
        : [];

    return Array.from(new Set([type, ...values]));
}

function inferMimeType(filename) {
    const lower = String(filename || "").toLowerCase();

    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
    if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
    if (lower.endsWith(".html")) return "text/html; charset=utf-8";
    if (lower.endsWith(".json")) return "application/json; charset=utf-8";
    if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (lower.endsWith(".ts")) return "text/plain; charset=utf-8";
    if (lower.endsWith(".py")) return "text/plain; charset=utf-8";
    if (lower.endsWith(".sh")) return "text/plain; charset=utf-8";

    return "application/octet-stream";
}

async function listAllObjects(bucket) {
    const objects = [];
    let cursor = undefined;

    do {
        const page = await bucket.list({
            cursor,
            limit: 1000,
        });

        objects.push(...page.objects);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return objects;
}

function groupBucketObjects(objects) {
    const groups = new Map();

    objects.forEach((object) => {
        const parts = String(object.key || "").split("/").filter(Boolean);
        if (parts.length < 3) return;

        const type = parts[0].toLowerCase();
        const slug = normalizeSlug(parts[1]);
        if (!ALLOWED_TYPES.has(type)) return;

        const filename = parts.slice(2).join("/");
        const groupKey = `${type}/${slug}`;
        const group = groups.get(groupKey) || {
            type,
            slug,
            prefix: `${type}/${slug}/`,
            metaKey: "",
            assets: [],
        };

        if (filename.toLowerCase() === META_FILENAME) {
            group.metaKey = object.key;
        } else {
            group.assets.push({
                key: object.key,
                fileName: filename,
                uploaded: object.uploaded || null,
                size: object.size || 0,
            });
        }

        groups.set(groupKey, group);
    });

    return Array.from(groups.values()).sort((left, right) => left.prefix.localeCompare(right.prefix));
}

async function readMeta(bucket, metaKey) {
    if (!metaKey) return {};

    const object = await bucket.get(metaKey);
    if (!object) return {};

    try {
        const payload = await object.json();
        return payload && typeof payload === "object" ? payload : {};
    } catch {
        return {};
    }
}

function getAssetPriority(asset) {
    const lower = asset.fileName.toLowerCase();

    if (lower.startsWith("index.")) return 0;
    if (lower.startsWith("readme.")) return 1;
    if (lower.startsWith("cover.") || lower.startsWith("preview.")) return 2;
    return 10;
}

function pickPrimaryAsset(group, meta) {
    const assets = group.assets.slice();
    if (assets.length === 0) return null;

    if (typeof meta.asset === "string" && meta.asset.trim()) {
        const preferred = meta.asset.trim();
        const exactMatch = assets.find((asset) => asset.fileName === preferred);
        if (exactMatch) return exactMatch;
    }

    return assets.sort((left, right) => {
        const priorityDelta = getAssetPriority(left) - getAssetPriority(right);
        if (priorityDelta !== 0) return priorityDelta;
        return left.fileName.localeCompare(right.fileName);
    })[0];
}

function buildAssetUrl(requestUrl, key) {
    return new URL(`/api/content/${encodeURIComponent(key)}`, requestUrl).toString();
}

async function buildCatalog(request, bucket) {
    const objects = await listAllObjects(bucket);
    const groups = groupBucketObjects(objects);
    const items = [];

    for (const group of groups) {
        const meta = await readMeta(bucket, group.metaKey);
        const asset = pickPrimaryAsset(group, meta);
        if (!asset) continue;

        const title = typeof meta.title === "string" && meta.title.trim()
            ? meta.title.trim()
            : titleFromSlug(group.slug);
        const summary = typeof meta.summary === "string" && meta.summary.trim()
            ? meta.summary.trim()
            : `Hosted file from ${group.prefix}`;
        const order = Number.isFinite(Number(meta.order))
            ? Number(meta.order)
            : (items.length + 1) * 10;

        items.push({
            id: normalizeSlug(meta.id || `${group.type}-${group.slug}`, `${group.type}-${group.slug}`),
            type: group.type,
            title,
            summary,
            repo: "r2",
            path: asset.key,
            tags: normalizeTags(meta.tags, group.type),
            href: buildAssetUrl(request.url, asset.key),
            order,
            mimeType: inferMimeType(asset.fileName),
            size: asset.size,
            uploadedAt: asset.uploaded ? new Date(asset.uploaded).toISOString() : null,
        });
    }

    return items.sort((left, right) => {
        if (left.order !== right.order) return left.order - right.order;
        return left.title.localeCompare(right.title);
    });
}

function decodeContentKey(pathname) {
    const encodedKey = pathname.replace(/^\/api\/content\//, "");
    if (!encodedKey) return "";

    try {
        return decodeURIComponent(encodedKey);
    } catch {
        return "";
    }
}

async function handleCatalog(request, env) {
    const items = await buildCatalog(request, env.CONTENT_BUCKET);
    return jsonResponse(items, {
        headers: {
            "Cache-Control": "public, max-age=60",
        },
    });
}

async function handleContent(request, env) {
    const key = decodeContentKey(new URL(request.url).pathname);
    if (!key) {
        return textResponse("Missing content key", {
            status: 400,
        });
    }

    const object = await env.CONTENT_BUCKET.get(key);
    if (!object) {
        return textResponse("Not found", {
            status: 404,
        });
    }

    const headers = buildCorsHeaders({
        "Cache-Control": "public, max-age=300",
        "Content-Type": inferMimeType(key),
    });

    if (typeof object.writeHttpMetadata === "function") {
        object.writeHttpMetadata(headers);
    }

    if (object.httpEtag) {
        headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, {
        headers,
    });
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: buildCorsHeaders(),
            });
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return textResponse("Method not allowed", {
                status: 405,
            });
        }

        const url = new URL(request.url);

        if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/health") {
            return jsonResponse({
                ok: true,
                service: "ark-catalog-api",
                storage: "r2",
                types: Array.from(ALLOWED_TYPES),
            });
        }

        if (url.pathname === "/api/catalog") {
            return handleCatalog(request, env);
        }

        if (url.pathname.startsWith("/api/content/")) {
            return handleContent(request, env);
        }

        return textResponse("Not found", {
            status: 404,
        });
    },
};

/**
 * Pure helpers for YouTube page URLs.
 *
 * This module must stay free of extension / DOM APIs so that it can be imported
 * by the content script, the background and the Node test-suite alike.
 */

/**
 * The only hosts a YouTube (yt-dlp) download request may point to.
 * Keep this the single source of truth for the allowlist.
 */
export const YOUTUBE_ALLOWED_HOSTS: ReadonlyArray<string> = Object.freeze([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
])

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/

const NORMALIZED_WATCH_URL_PREFIX = "https://www.youtube.com/watch?v="

export function isValidYouTubeVideoId(id: unknown): id is string {
    return typeof id === "string" && VIDEO_ID_REGEX.test(id)
}

/**
 * Extracts the 11 character video id from a YouTube watch / shorts / youtu.be URL.
 * Returns null for anything that is not a single-video URL on an allowed host.
 */
export function extractYouTubeVideoId(input: unknown): string | null {
    if (typeof input !== "string") {
        return null
    }
    let url: URL
    try {
        url = new URL(input.trim())
    } catch (e) {
        return null
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return null
    }
    // no credentials or custom ports: those are never legit YouTube page URLs
    if (url.username !== "" || url.password !== "" || url.port !== "") {
        return null
    }
    const host = url.hostname.toLowerCase()
    if (!YOUTUBE_ALLOWED_HOSTS.includes(host)) {
        return null
    }
    const segments = url.pathname.split("/").filter((s) => s.length > 0)

    let candidate: string | null = null
    if (host === "youtu.be") {
        // https://youtu.be/<ID>
        if (segments.length === 1) {
            candidate = segments[0]
        }
    } else if (segments.length === 1 && segments[0] === "watch") {
        // https://www.youtube.com/watch?v=<ID>
        candidate = url.searchParams.get("v")
    } else if (segments.length === 2 && segments[0] === "shorts") {
        // https://www.youtube.com/shorts/<ID>
        candidate = segments[1]
    }
    return isValidYouTubeVideoId(candidate) ? candidate : null
}

/**
 * Normalizes a YouTube video URL to exactly `https://www.youtube.com/watch?v=<ID>`.
 * All other query parameters (list=, t=, si=, ...) are dropped.
 * Returns null when the input is not an acceptable YouTube video URL.
 */
export function normalizeYouTubeUrl(input: unknown): string | null {
    const id = extractYouTubeVideoId(input)
    if (id === null) {
        return null
    }
    return NORMALIZED_WATCH_URL_PREFIX + id
}

const MAX_TITLE_LENGTH = 300

/**
 * Cleans a video title read from the page before it is shown or sent to the app.
 * The result is plain text; callers must still render it via textContent only.
 */
export function cleanYouTubeTitle(input: unknown): string | undefined {
    if (typeof input !== "string") {
        return undefined
    }
    const collapsed = input
        // control characters (incl. newlines / tabs) -> space
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    // slice by code points so a surrogate pair is never cut in half
    const cleaned = Array.from(collapsed).slice(0, MAX_TITLE_LENGTH).join("").trim()
    if (cleaned.length === 0 || cleaned === "YouTube") {
        return undefined
    }
    return cleaned
}

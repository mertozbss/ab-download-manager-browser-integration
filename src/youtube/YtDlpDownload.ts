import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {DownloadRequestOptions} from "~/interfaces/DownloadRequestOptions";
import {cleanYouTubeTitle, normalizeYouTubeUrl} from "~/youtube/YouTubeUrl";

/**
 * Message sent from the YouTube content script to the background.
 * The background re-validates it; the page is never trusted.
 */
export interface YtDlpDownloadRequest {
    link: string
    title?: string
}

/**
 * YouTube downloads always open the app's quality window, so they are never
 * added / started silently, whatever the user's "Add downloads silently" option is.
 */
export const YTDLP_DOWNLOAD_REQUEST_OPTIONS: Readonly<DownloadRequestOptions> = Object.freeze({
    silentAdd: false,
    silentStart: false,
})

/**
 * Builds the item sent to the app: `{ type: "ytdlp", link, title? }`.
 * Returns null if the link is not an acceptable YouTube video URL.
 */
export function createYtDlpDownloadRequestItem(
    link: unknown,
    title?: unknown,
): DownloadRequestItem | null {
    const normalized = normalizeYouTubeUrl(link)
    if (normalized === null) {
        return null
    }
    const item: DownloadRequestItem = {
        type: "ytdlp",
        link: normalized,
    }
    const cleanedTitle = cleanYouTubeTitle(title)
    if (cleanedTitle !== undefined) {
        item.title = cleanedTitle
    }
    return item
}

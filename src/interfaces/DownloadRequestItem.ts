export interface DownloadRequestItem {
    link: string
    // the following fields are used by "http" / "hls" items; "ytdlp" items omit them
    downloadPage?: string | null
    headers?: DownloadRequestHeaders | null
    description?: string | null,
    suggestedName?: string | null,
    // "ytdlp": `link` is a normalized YouTube page URL that the app hands to yt-dlp
    type: "hls" | "http" | "ytdlp"
    // optional human-readable title (currently only sent with "ytdlp" items)
    title?: string
}
export type DownloadRequestHeaders = Record<string, string>

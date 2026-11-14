import browser from "webextension-polyfill";
import {sendMessage} from "webext-bridge/content-script";
import {distinctUntilChanged, map} from "rxjs";
import * as Configs from "~/configs/Config";
import {DefinedCommands} from "~/message/Commands";
import {defineExtensionEntry} from "~/utils/DefineExtensionEntry";
import ContentScriptEntryType from "~/utils/EntryPointTypes/ContentScript/ContentScriptEntryType";
import {
    createYouTubeDownloadButton,
    YOUTUBE_BUTTON_HOST_ATTRIBUTE,
    YouTubeDownloadButton,
} from "~/youtube/YouTubeDownloadButton";
import {cleanYouTubeTitle, extractYouTubeVideoId, normalizeYouTubeUrl} from "~/youtube/YouTubeUrl";
import {YtDlpDownloadRequest} from "~/youtube/YtDlpDownload";

/**
 * Content script that only runs on YouTube (see src/manifest/shared.ts).
 * It puts a "download this video" button on the player; clicking it asks the
 * background to send a `ytdlp` download request to the app.
 */

const WATCH_PLAYER_SELECTORS = [
    "ytd-watch-flexy #movie_player",
    "#movie_player",
    "ytd-player .html5-video-player",
]
const SHORTS_PLAYER_SELECTORS = [
    "ytd-reel-video-renderer[is-active] #shorts-player",
    "ytd-reel-video-renderer[is-active] .html5-video-player",
    "ytd-shorts #shorts-player",
    "#shorts-player",
]
const WATCH_TITLE_SELECTORS = [
    "ytd-watch-metadata #title h1",
    "ytd-watch-metadata h1",
    "#above-the-fold #title h1",
]
const SHORTS_TITLE_SELECTORS = [
    "ytd-reel-video-renderer[is-active] yt-shorts-video-title-view-model",
    "ytd-reel-video-renderer[is-active] h2",
]

// re-check periodically as a safety net: YouTube re-renders the player and
// not every in-app navigation (e.g. scrolling Shorts) is guaranteed to fire yt-navigate-finish
const CHECK_INTERVAL_MS = 1000

interface MountedButton {
    button: YouTubeDownloadButton
    player: HTMLElement
    videoId: string
    detachPlayerListeners: () => void
}

let mounted: MountedButton | null = null
let buttonEnabled = true
let sending = false
let stopped = false

function isShortsPage() {
    return location.pathname.startsWith("/shorts/")
}

function isVisible(element: HTMLElement) {
    return element.offsetWidth > 0 && element.offsetHeight > 0
}

function findPlayer(): HTMLElement | null {
    const selectors = isShortsPage() ? SHORTS_PLAYER_SELECTORS : WATCH_PLAYER_SELECTORS
    let fallback: HTMLElement | null = null
    for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
            if (isVisible(element)) {
                return element
            }
            fallback = fallback ?? element
        }
    }
    return fallback
}

function readVideoTitle(): string | undefined {
    const selectors = isShortsPage() ? SHORTS_TITLE_SELECTORS : WATCH_TITLE_SELECTORS
    for (const selector of selectors) {
        const title = cleanYouTubeTitle(document.querySelector(selector)?.textContent)
        if (title !== undefined) {
            return title
        }
    }
    const fromDocumentTitle = document.title
        .replace(/^\(\d+\+?\)\s*/, "") // unread notifications counter, e.g. "(3) "
        .replace(/\s+-\s+YouTube$/, "")
    return cleanYouTubeTitle(fromDocumentTitle)
}

function getButtonLabel() {
    let label = ""
    try {
        label = browser.i18n.getMessage("youtube_download_button")
    } catch (e) {
        // ignored
    }
    return label || "Download this video"
}

/** Removes every button of ours from the page except `keep` (also cleans up orphaned instances). */
function removeStrayButtons(keep: Element | null = null) {
    for (const element of Array.from(document.querySelectorAll(`[${YOUTUBE_BUTTON_HOST_ATTRIBUTE}]`))) {
        if (element !== keep) {
            element.remove()
        }
    }
}

function unmount() {
    if (mounted === null) {
        return
    }
    mounted.detachPlayerListeners()
    mounted.button.remove()
    mounted = null
}

function mount(player: HTMLElement, videoId: string) {
    unmount()
    removeStrayButtons()
    const button = createYouTubeDownloadButton(document, {
        label: getButtonLabel(),
        onClick: () => {
            onButtonClicked()
        },
    })
    const show = () => {
        // read the title on hover so it always matches the current video
        button.setVideoTitle(readVideoTitle())
        button.setVisible(true)
    }
    const hide = () => {
        button.setVisible(false)
    }
    player.addEventListener("mouseenter", show)
    player.addEventListener("mouseleave", hide)
    player.appendChild(button.host)
    if (player.matches(":hover")) {
        show()
    }
    mounted = {
        button,
        player,
        videoId,
        detachPlayerListeners: () => {
            player.removeEventListener("mouseenter", show)
            player.removeEventListener("mouseleave", hide)
        },
    }
}

function isExtensionContextAlive() {
    try {
        // undefined after the extension is reloaded / updated (orphaned content script)
        return !!browser.runtime?.id
    } catch (e) {
        return false
    }
}

/** Idempotent: brings the page to the expected state (zero or exactly one button). */
function sync() {
    if (stopped) {
        return
    }
    if (!isExtensionContextAlive()) {
        stop()
        return
    }
    const videoId = buttonEnabled ? extractYouTubeVideoId(location.href) : null
    if (videoId === null) {
        unmount()
        removeStrayButtons()
        return
    }
    const player = findPlayer()
    if (player === null) {
        unmount()
        return
    }
    if (
        mounted !== null
        && mounted.player === player
        && mounted.button.host.parentNode === player
    ) {
        if (mounted.videoId !== videoId) {
            // same player, new video (SPA navigation)
            mounted.videoId = videoId
            mounted.button.setVideoTitle(null)
        }
        removeStrayButtons(mounted.button.host)
        return
    }
    mount(player, videoId)
}

async function onButtonClicked() {
    if (sending) {
        return
    }
    const link = normalizeYouTubeUrl(location.href)
    if (link === null) {
        return
    }
    const request: YtDlpDownloadRequest = {link}
    const title = readVideoTitle()
    if (title !== undefined) {
        request.title = title
    }
    sending = true
    try {
        await sendMessage(DefinedCommands.ADD_YTDLP_DOWNLOAD, request, "background")
    } catch (e) {
        console.log("ab-dm: failed to send the YouTube download request", e)
    } finally {
        sending = false
    }
}

let stopHandlers: Array<() => void> = []

function stop() {
    stopped = true
    for (const handler of stopHandlers) {
        try {
            handler()
        } catch (e) {
            // ignored
        }
    }
    stopHandlers = []
    unmount()
}

export default defineExtensionEntry()
    .withType(ContentScriptEntryType)
    .withInit(async (ctx) => {
        const onNavigation = () => sync()
        // YouTube is a SPA; this event fires after every in-app navigation
        document.addEventListener("yt-navigate-finish", onNavigation)
        window.addEventListener("popstate", onNavigation)
        const intervalId = setInterval(onNavigation, CHECK_INTERVAL_MS)
        // BehaviorSubject: emits the current value right away, then on every option change
        const subscription = Configs.getOnChanged()
            .pipe(map((config) => config.youtubeButtonEnabled))
            .pipe(distinctUntilChanged())
            .subscribe((enabled) => {
                buttonEnabled = enabled
                sync()
            })
        stopHandlers.push(() => {
            document.removeEventListener("yt-navigate-finish", onNavigation)
            window.removeEventListener("popstate", onNavigation)
            clearInterval(intervalId)
            subscription.unsubscribe()
        })
        ctx.getDisposable().add(() => stop())
    })

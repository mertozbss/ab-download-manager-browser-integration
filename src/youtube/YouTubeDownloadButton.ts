/**
 * The "download this video" button injected on top of the YouTube player.
 *
 * Security notes:
 * - Everything lives in a closed Shadow DOM so the page CSS cannot restyle it.
 * - The DOM is built only with createElement / createElementNS / textContent /
 *   setAttribute. Never use innerHTML / insertAdjacentHTML / outerHTML here:
 *   the video title is untrusted page data.
 *
 * This module only depends on the DOM so it can be tested with jsdom.
 */

/** Marker attribute on the host element; used to find (and de-duplicate) our buttons. */
export const YOUTUBE_BUTTON_HOST_ATTRIBUTE = "data-abdm-youtube-button"

const VISIBLE_ATTRIBUTE = "data-visible"

const STYLE = `
:host {
  all: initial;
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1000;
  display: block;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  direction: ltr;
}
:host([${VISIBLE_ATTRIBUTE}]),
:host(:focus-within) {
  opacity: 1;
}
.btn {
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: linear-gradient(to bottom right, #2E3038, #171820);
  color: #ffffff;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 16px;
  cursor: pointer;
  box-shadow: rgba(0, 0, 0, 0.3) 0 2px 6px;
}
:host([${VISIBLE_ATTRIBUTE}]) .btn,
:host(:focus-within) .btn {
  pointer-events: auto;
}
.btn:hover {
  background: linear-gradient(to bottom right, #3A3D47, #1F2029);
}
.btn:focus-visible {
  outline: 2px solid #C631FF;
  outline-offset: 2px;
}
.icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.tip {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  max-width: 320px;
  width: max-content;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.85);
  color: #dddddd;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  line-height: 16px;
  white-space: normal;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.tip:empty {
  display: none !important;
}
.btn:hover + .tip,
.btn:focus-visible + .tip {
  display: block;
}
`

// static, constant icon path (download arrow); no dynamic data goes in here
const ICON_PATH = "M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1zM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z"

const SVG_NS = "http://www.w3.org/2000/svg"

export interface YouTubeDownloadButtonOptions {
    /** Text shown on the button, e.g. "Download this video". */
    label: string
    /** Called when the user clicks the button. */
    onClick: () => void
}

export interface YouTubeDownloadButton {
    /** The element to attach to the player; holds the (closed) shadow root. */
    readonly host: HTMLElement
    /** The closed shadow root (exposed for tests only). */
    readonly root: ShadowRoot
    /** Shows the (untrusted) video title in the tooltip, as plain text. */
    setVideoTitle(title: string | null | undefined): void

    setVisible(visible: boolean): void

    /** Removes the button from the page. */
    remove(): void
}

function stopEvent(event: Event) {
    // keep YouTube from reacting (play/pause on click, fullscreen on dblclick, ...)
    event.stopPropagation()
}

export function createYouTubeDownloadButton(
    doc: Document,
    options: YouTubeDownloadButtonOptions,
): YouTubeDownloadButton {
    const host = doc.createElement("div")
    host.setAttribute(YOUTUBE_BUTTON_HOST_ATTRIBUTE, "")
    const root = host.attachShadow({mode: "closed"})

    const style = doc.createElement("style")
    style.textContent = STYLE
    root.appendChild(style)

    const button = doc.createElement("button")
    button.type = "button"
    button.className = "btn"
    button.setAttribute("aria-label", options.label)

    const icon = doc.createElementNS(SVG_NS, "svg")
    icon.setAttribute("class", "icon")
    icon.setAttribute("viewBox", "0 0 24 24")
    icon.setAttribute("aria-hidden", "true")
    const path = doc.createElementNS(SVG_NS, "path")
    path.setAttribute("d", ICON_PATH)
    path.setAttribute("fill", "currentColor")
    icon.appendChild(path)
    button.appendChild(icon)

    const label = doc.createElement("span")
    label.className = "label"
    label.textContent = options.label
    button.appendChild(label)

    root.appendChild(button)

    const tip = doc.createElement("span")
    tip.className = "tip"
    tip.setAttribute("role", "tooltip")
    root.appendChild(tip)

    button.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        options.onClick()
    })
    for (const type of ["mousedown", "mouseup", "pointerdown", "pointerup", "dblclick", "keydown", "keyup"]) {
        button.addEventListener(type, stopEvent)
    }

    return {
        host,
        root,
        setVideoTitle(title) {
            const text = typeof title === "string" ? title : ""
            // textContent only: the title is untrusted page data
            tip.textContent = text
        },
        setVisible(visible) {
            if (visible) {
                host.setAttribute(VISIBLE_ATTRIBUTE, "")
            } else {
                host.removeAttribute(VISIBLE_ATTRIBUTE)
            }
        },
        remove() {
            host.remove()
        },
    }
}

/**
 * Pure keyboard-routing logic for the map page's global keydown handler
 * (src/app/map/page.tsx, P2 a11y relay B1/B2).
 *
 * Extracted so the target-guard and modifier-key logic is unit-testable
 * without rendering the full map page -- CanopyMap needs a WebGL-capable
 * MapLibre canvas that happy-dom can't provide. Same "extract the pure
 * decision to a testable module" pattern as forest-carbon-client.ts's
 * createSeqGuard/isSelectionTooLarge.
 *
 * Two guards, deliberately NOT unified (B1):
 *   - isTextEntryTarget (NARROW): input/textarea only. Used for the Escape
 *     ladder, which must still dismiss panels even when a <button> has
 *     focus (e.g. the panel Close button Escape itself just moved focus
 *     onto) -- a wide guard on Escape would be a keyboard trap.
 *   - isEditableOrControl (WIDE): any interactive control. Used for
 *     Alt+S / Alt+W / Space / arrow-key shortcuts, so they don't fire (and
 *     don't preventDefault) while focus is on a button, link, or form
 *     control -- e.g. Space must activate a focused button, not hijack
 *     timeline playback.
 */

/** ARIA roles that make a non-native element behave like an interactive
 *  control for keyboard-shortcut purposes (e.g. a styled `role="button"`
 *  element that isn't a native `<button>`). */
const INTERACTIVE_ROLES = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "button",
  "switch",
  "checkbox",
  "radio",
  "listbox",
  "option",
  "menuitem",
  "tab",
  "slider",
  "spinbutton",
]);

/**
 * WIDE guard (B1): true when `target` is any interactive control --
 * input/textarea, contenteditable, `<button>`, `<select>`, an `<a href>`,
 * or an element carrying an interactive ARIA role.
 */
export function isEditableOrControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target.isContentEditable) return true;
  if (target.tagName === "BUTTON" || target.tagName === "SELECT") return true;
  if (target.tagName === "A" && target.hasAttribute("href")) return true;
  const role = target.getAttribute("role");
  return role != null && INTERACTIVE_ROLES.has(role);
}

/**
 * NARROW guard: true only for input/textarea. Preserved exactly as the
 * original blanket guard behaved, but scoped to the Escape branch only --
 * this is what keeps SearchBar's own Escape handling (blur + close
 * dropdown) from double-firing this page-level ladder.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** The subset of KeyboardEvent this module reads -- kept structural so
 *  tests can pass a plain object instead of constructing a real
 *  KeyboardEvent. `code` is optional in the shape (a real KeyboardEvent
 *  always carries one) so pre-existing test fixtures that only set `key`
 *  keep working unchanged. */
export interface ShortcutKeyEvent {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}

/**
 * True when `event` is an unmodified Alt+<letter> press (B2, WCAG 2.1.4:
 * single-character shortcuts must be remappable/disableable -- gating
 * behind Alt satisfies that without a settings UI) with no Ctrl/Cmd held
 * (so OS/browser shortcuts are never hijacked -- e.g. Ctrl+Alt+S bails)
 * and focus isn't on an interactive control (B1's wide guard). Bare `s`/`w`
 * (no Alt) always return false here -- they no longer do anything.
 *
 * Matches on EITHER the layout-independent `event.code` (`"KeyS"`/`"KeyW"`)
 * OR `event.key` -- `code` is what actually fires on macOS, where
 * Option+S/Option+W remap `key` to `"ß"`/`"∑"` (dead-key/special-character
 * layout behavior) so a `key`-only check never matched there even though
 * `aria-keyshortcuts="Alt+S"` advertised it. The `key` check stays as a
 * second path so pre-existing fixtures that only set `key` (no `code`,
 * simulating Windows/Linux where Alt doesn't remap the letter) keep
 * matching -- `code` on a real KeyboardEvent is present, but a plain test
 * object omitting it just falls through to the `key` comparison.
 */
export function matchesAltShortcut(event: ShortcutKeyEvent, letter: "s" | "w"): boolean {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  const matchesCode = event.code === `Key${letter.toUpperCase()}`;
  const matchesKey = event.key.toLowerCase() === letter;
  if (!matchesCode && !matchesKey) return false;
  return !isEditableOrControl(event.target);
}

/**
 * True when `event` should be allowed to drive a timeline transport action
 * (arrow-step or space-toggle-play): no Ctrl/Cmd modifier held, and focus
 * isn't on an interactive control. The caller still checks the specific
 * key (ArrowLeft/ArrowRight/" ") -- this only answers the modifier +
 * target-guard question, which is shared across all three keys.
 */
export function isTimelineTransportKey(event: ShortcutKeyEvent): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  return !isEditableOrControl(event.target);
}

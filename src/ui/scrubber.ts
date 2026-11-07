/**
 * Pointer handling for the timeline strip.
 *
 * The strip does three jobs at once, told apart by what the pointer does
 * rather than by a mode switch:
 *
 *   hover                 move the cursor along the spiral and update the
 *                         readout. Nothing is changed by looking.
 *   click, then click     set the window's start, then its end. A click is a
 *                         press and release that did not travel, so it can
 *                         never be confused with a drag.
 *   drag inside the window
 *                         slide the whole window along the record, keeping its
 *                         length. Outside the window a drag just scrubs, which
 *                         is what a hover would have done anyway.
 *
 * Pointer capture means a drag that leaves the strip keeps working instead of
 * stopping dead at the edge.
 */

/** Travel, in pixels, past which a press stops being a click and becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

export interface ScrubberOptions {
  /** Called with a fractional hour index while scrubbing. */
  onScrub(hourIndex: number): void;
  /** Called when the pointer leaves without a drag in progress. */
  onLeave(): void;
  /** Map a client x coordinate to a fractional hour index. */
  hourIndexAtClientX(clientX: number): number | null;
  /** Whether an hour lies inside the window currently on the piece. */
  isInsideWindow(hourIndex: number): boolean;
  /** Whether a window edge is waiting to be placed; a click then completes it. */
  isPicking(): boolean;
  /** A click: place a window edge here. */
  onPick(hourIndex: number): void;
  /** A drag inside the window began. */
  onWindowDragStart(): void;
  /** The window should sit this many hours from where it was when the drag began. */
  onWindowDrag(deltaHours: number): void;
  /** The drag finished; the move is now worth a history entry. */
  onWindowDragEnd(): void;
  /** Hover feedback: true while the pointer is over the window band. */
  onHoverWindow(inside: boolean): void;
}

type PressMode = 'pick' | 'move';

export function attachScrubber(target: HTMLElement, options: ScrubberOptions): () => void {
  let pressed = false;
  let mode: PressMode = 'pick';
  let pressX = 0;
  let pressHour = 0;
  let travelled = false;

  // Window drags are coalesced into one update per frame: rebuilding the wall
  // on every pointermove would do the same work three or four times a frame.
  let pendingDelta: number | null = null;
  let frame = 0;
  const flush = (): void => {
    frame = 0;
    if (pendingDelta === null) return;
    options.onWindowDrag(pendingDelta);
    pendingDelta = null;
  };
  const queueDelta = (delta: number): void => {
    pendingDelta = delta;
    if (frame === 0) frame = requestAnimationFrame(flush);
  };

  const hourAt = (clientX: number): number | null => options.hourIndexAtClientX(clientX);

  const onPointerDown = (event: PointerEvent): void => {
    const hour = hourAt(event.clientX);
    if (hour === null) return;
    pressed = true;
    travelled = false;
    pressX = event.clientX;
    pressHour = hour;
    // A half-placed window takes priority: the next click finishes it, even if
    // it lands inside the window that is about to be replaced.
    mode = !options.isPicking() && options.isInsideWindow(hour) ? 'move' : 'pick';
    if (mode === 'move') options.onWindowDragStart();
    target.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    const hour = hourAt(event.clientX);
    if (hour === null) return;

    if (!pressed) {
      if (event.pointerType === 'touch') return;
      options.onHoverWindow(options.isInsideWindow(hour));
      options.onScrub(hour);
      return;
    }

    if (!travelled && Math.abs(event.clientX - pressX) > DRAG_THRESHOLD_PX) travelled = true;
    if (mode === 'move' && travelled) queueDelta(hour - pressHour);
    else options.onScrub(hour);
  };

  const endPress = (event: PointerEvent): void => {
    if (!pressed) return;
    pressed = false;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);

    if (mode === 'move' && travelled) {
      flush();
      options.onWindowDragEnd();
      return;
    }
    if (!travelled) options.onPick(pressHour);
  };

  const onPointerLeave = (): void => {
    if (pressed) return;
    options.onHoverWindow(false);
    options.onLeave();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      PageDown: -24,
      PageUp: 24,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      target.dispatchEvent(new CustomEvent('scrub-step', { detail: step }));
      return;
    }
    if (event.key === 'Escape' && options.isPicking()) {
      event.preventDefault();
      target.dispatchEvent(new CustomEvent('scrub-cancel'));
    }
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', endPress);
  target.addEventListener('pointercancel', endPress);
  target.addEventListener('pointerleave', onPointerLeave);
  target.addEventListener('keydown', onKeyDown);
  target.tabIndex = 0;

  return () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', endPress);
    target.removeEventListener('pointercancel', endPress);
    target.removeEventListener('pointerleave', onPointerLeave);
    target.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Turn two picked hours into a window, in the order they fall on the record and
 * never shorter than the minimum the clock will accept.
 */
export function windowFromPicks(
  a: number,
  b: number,
  totalHours: number,
  minimumHours = 24,
): { startHour: number; endHour: number } {
  let start = Math.round(Math.min(a, b));
  let end = Math.round(Math.max(a, b));
  if (end - start < minimumHours) {
    // Grow around the pick rather than snapping to one side of it.
    const centre = (start + end) / 2;
    start = Math.round(centre - minimumHours / 2);
    end = start + minimumHours;
  }
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > totalHours - 1) {
    const overshoot = end - (totalHours - 1);
    end = totalHours - 1;
    start = Math.max(0, start - overshoot);
  }
  return { startHour: start, endHour: end };
}

/** Slide a window by whole hours, keeping its length, clamped to the record. */
export function shiftWindow(
  i0: number,
  i1: number,
  deltaHours: number,
  totalHours: number,
): { startHour: number; endHour: number } {
  const span = i1 - i0;
  let start = Math.round(i0 + deltaHours);
  start = Math.min(Math.max(start, 0), totalHours - 1 - span);
  return { startHour: start, endHour: start + span };
}

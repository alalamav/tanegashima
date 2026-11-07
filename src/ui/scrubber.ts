/**
 * Dragging along the timeline strip moves a cursor along the spiral. Pointer
 * events are captured, so a drag that leaves the strip keeps scrubbing instead
 * of stopping dead at the edge.
 */

export interface ScrubberOptions {
  /** Called with a fractional hour index while scrubbing. */
  onScrub(hourIndex: number): void;
  /** Called when the pointer leaves without a drag in progress. */
  onLeave(): void;
  /** Map a client x coordinate to a fractional hour index. */
  hourIndexAtClientX(clientX: number): number | null;
}

export function attachScrubber(target: HTMLElement, options: ScrubberOptions): () => void {
  let dragging = false;

  const report = (clientX: number): void => {
    const hourIndex = options.hourIndexAtClientX(clientX);
    if (hourIndex !== null) options.onScrub(hourIndex);
  };

  const onPointerDown = (event: PointerEvent): void => {
    dragging = true;
    target.setPointerCapture(event.pointerId);
    report(event.clientX);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging && event.pointerType === 'touch') return;
    report(event.clientX);
  };

  const onPointerUp = (event: PointerEvent): void => {
    dragging = false;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  const onPointerLeave = (): void => {
    if (!dragging) options.onLeave();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Keyboard scrubbing, so the readout is reachable without a pointer.
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      PageDown: -24,
      PageUp: 24,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    target.dispatchEvent(new CustomEvent('scrub-step', { detail: step }));
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  target.addEventListener('pointerleave', onPointerLeave);
  target.addEventListener('keydown', onKeyDown);
  target.tabIndex = 0;

  return () => {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerUp);
    target.removeEventListener('pointerleave', onPointerLeave);
    target.removeEventListener('keydown', onKeyDown);
  };
}

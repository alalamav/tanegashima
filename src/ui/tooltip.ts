/**
 * The ⓘ icon and the panel that hangs off it.
 *
 * One tooltip element is shared by every icon, created once and moved, so a
 * panel of forty controls costs one node rather than forty. The text is supplied
 * as a callback rather than a string, so a tooltip that quotes live numbers
 * (the acceptable turn range, say) is always current at the moment it opens
 * rather than at the moment it was wired up.
 *
 * It opens on hover and on keyboard focus, closes on Escape, and toggles on tap
 * for touch devices, which have no hover at all.
 */

const TOOLTIP_ID = 'help-tooltip';
const EDGE_MARGIN = 8;

export interface TooltipHost {
  /** Put an ⓘ button inside `host` and wire it to `getText`. */
  attach(host: HTMLElement, getText: () => string | null, label: string): HTMLButtonElement | null;
  /** Close whatever is open. */
  hide(): void;
  dispose(): void;
}

export function createTooltipHost(): TooltipHost {
  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.className = 'help-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  let openFor: HTMLElement | null = null;

  const hide = (): void => {
    tooltip.hidden = true;
    openFor?.removeAttribute('aria-describedby');
    openFor?.classList.remove('is-open');
    openFor = null;
  };

  const show = (anchor: HTMLElement, text: string): void => {
    tooltip.textContent = text;
    tooltip.hidden = false;
    openFor = anchor;
    anchor.setAttribute('aria-describedby', TOOLTIP_ID);
    anchor.classList.add('is-open');

    // Measure first, then place: prefer the left of the anchor (the panel lives
    // on the right edge of the window), and flip or clamp if that overflows.
    const box = anchor.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();

    let left = box.left - size.width - 10;
    if (left < EDGE_MARGIN) left = Math.min(box.right + 10, window.innerWidth - size.width - EDGE_MARGIN);
    left = Math.max(EDGE_MARGIN, Math.min(left, window.innerWidth - size.width - EDGE_MARGIN));

    let top = box.top + box.height / 2 - size.height / 2;
    top = Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - size.height - EDGE_MARGIN));

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') hide();
  };
  const onScroll = (): void => hide();

  document.addEventListener('keydown', onKeyDown);
  // A tooltip pinned to a row inside a scrolling panel would drift; close it.
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);

  const attach = (
    host: HTMLElement,
    getText: () => string | null,
    label: string,
  ): HTMLButtonElement | null => {
    if (getText() === null) return null;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'help-icon';
    button.textContent = 'i';
    button.setAttribute('aria-label', label);
    // The icon is a disclosure, not a control: never let it take a tab stop away
    // from the parameter it describes. Shift+Tab still reaches it.
    button.tabIndex = 0;

    const open = (): void => {
      const text = getText();
      if (text) show(button, text);
    };

    button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      open();
    });
    button.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'touch') return;
      hide();
    });
    button.addEventListener('focus', open);
    button.addEventListener('blur', hide);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (openFor === button) hide();
      else open();
    });

    host.append(button);
    return button;
  };

  return {
    attach,
    hide,
    dispose: () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      tooltip.remove();
    },
  };
}

/**
 * Tweakpane renders a row as `.tp-lblv` with a label cell and a value cell. The
 * icon belongs in the label cell so it sits with the words; a row without one
 * (a button, say) gets it appended to the row itself.
 */
export function helpTarget(rowElement: HTMLElement): HTMLElement {
  return rowElement.querySelector<HTMLElement>('.tp-lblv_l') ?? rowElement;
}

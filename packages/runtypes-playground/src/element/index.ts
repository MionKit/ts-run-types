// The <runtypes-playground> web component. Import for the side effect of
// registering the element, or call defineRuntypesPlayground() explicitly.
import {RuntypesPlaygroundElement} from './runtypesPlaygroundElement.ts';

export {RuntypesPlaygroundElement} from './runtypesPlaygroundElement.ts';

export const TAG = 'runtypes-playground';

// Register the custom element once. Safe to call multiple times.
export function defineRuntypesPlayground(tag: string = TAG): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tag)) customElements.define(tag, RuntypesPlaygroundElement);
}

defineRuntypesPlayground();

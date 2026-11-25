/**
 * iPhone Safari opens the keyboard only for a field focused inside the tap
 * itself. The expense form mounts a moment after the tap (route change), so its
 * amount field would get focus without a keyboard. On the tap we focus a hidden
 * number field at once; when the amount field takes focus a moment later the
 * keyboard is already up and simply stays.
 */
let primer: HTMLInputElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function primeKeyboard() {
  if (typeof document === 'undefined') return;
  releaseKeyboard();
  const el = document.createElement('input');
  el.setAttribute('inputmode', 'decimal');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  // In view (iOS ignores focus on hidden fields), invisible, 16px so iOS doesn't zoom
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;';
  document.body.appendChild(el);
  el.focus();
  primer = el;
  // Never left behind if the form doesn't take over
  timer = setTimeout(releaseKeyboard, 2000);
}

/** Removes the hidden field (after the real field has focus). */
export function releaseKeyboard() {
  if (timer) clearTimeout(timer);
  timer = null;
  primer?.remove();
  primer = null;
}

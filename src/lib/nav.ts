import { router, type Href } from 'expo-router';

/**
 * Back to the previous screen, or to `fallback` when there is none. On the web
 * a screen can be the first one in the history (opened from a link, or the page
 * was reloaded), and a plain router.back() then does nothing.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

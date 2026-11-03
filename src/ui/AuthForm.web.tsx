import { createElement, type ReactNode } from 'react';

const FORM_ID = 'travelspend-auth-form';

/**
 * A real <form> on the web: Safari only offers "Save password" (and later
 * fills it in with Face ID) when the email and password are submitted as a form.
 */
export function AuthForm({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
  return createElement(
    'form',
    {
      id: FORM_ID,
      noValidate: true,
      onSubmit: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        onSubmit();
      },
      style: { display: 'flex', flexDirection: 'column', gap: 12 },
    },
    children,
    // Lets the keyboard's "Go" key submit
    createElement('button', { type: 'submit', style: { display: 'none' }, 'aria-hidden': true }),
  );
}

/** Submits through the form so the browser sees a real submission. */
export function submitAuthForm(onSubmit: () => void) {
  const form = typeof document !== 'undefined' ? (document.getElementById(FORM_ID) as HTMLFormElement | null) : null;
  if (form?.requestSubmit) form.requestSubmit();
  else onSubmit();
}

import { forwardRef, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useNavigate,
  type LinkProps,
  type NavLinkProps,
  type To,
} from 'react-router';

/**
 * Route changes on the public site run inside a view transition (a short cross-fade, see
 * motion.css). The router in use is the declarative BrowserRouter, which has no transition option,
 * so the click is taken here: the navigation runs inside `document.startViewTransition`, and
 * `flushSync` makes the new page land in the DOM before the browser takes its "after" picture.
 * Browsers without the API, reduced motion, modified clicks and new-tab links navigate as usual.
 */
function useTransitionClick(
  to: To,
  options: {
    replace?: boolean | undefined;
    state?: unknown;
    target?: string | undefined;
    reloadDocument?: boolean | undefined;
  },
  onClick: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined,
) {
  const navigate = useNavigate();
  const { replace, state, target, reloadDocument } = options;
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        reloadDocument ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (target !== undefined && target !== '_self') ||
        typeof document.startViewTransition !== 'function' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      event.preventDefault();
      document.startViewTransition(() => {
        flushSync(() => {
          void navigate(to, { replace: replace ?? false, state });
        });
      });
    },
    [navigate, to, replace, state, target, reloadDocument, onClick],
  );
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  const handle = useTransitionClick(props.to, props, props.onClick);
  return <RouterLink ref={ref} {...props} onClick={handle} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(props, ref) {
  const handle = useTransitionClick(props.to, props, props.onClick);
  return <RouterNavLink ref={ref} {...props} onClick={handle} />;
});

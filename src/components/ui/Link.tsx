import { forwardRef } from 'react';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  type LinkProps,
  type NavLinkProps,
} from 'react-router';

/**
 * The public site's links. Every navigation asks the browser for a view transition
 * (a short cross-fade); browsers without the API navigate as usual.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  return <RouterLink ref={ref} viewTransition {...props} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(props, ref) {
  return <RouterNavLink ref={ref} viewTransition {...props} />;
});

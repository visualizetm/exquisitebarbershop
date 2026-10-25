/**
 * The services on one chair's menu. A null menu (first available, or no chair chosen yet) keeps
 * them all. A chair only does its own menu and the server refuses the rest, so every picker that
 * already knows the chair lists just these.
 */
export function offeredServices<T extends { id: string }>(
  services: readonly T[],
  menu: readonly string[] | null | undefined,
): T[] {
  return menu ? services.filter((s) => menu.includes(s.id)) : [...services];
}

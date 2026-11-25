import alurFull from './assets/logos/alur-full.png';
import alurMark from './assets/logos/alur-mark.png';
import feliceFull from './assets/logos/felice-full.png';
import feliceMark from './assets/logos/felice-mark.png';

/** Logos by organisation slug. `mark` is the wordmark alone; `full` includes the tagline. */
const LOGOS: Record<string, { full: string; mark: string }> = {
  alur: { full: alurFull, mark: alurMark },
  felice: { full: feliceFull, mark: feliceMark },
};

/** Tiles share one shape so a wide logo and a squarer one line up. */
const TILE_RATIO = 2.4;

/**
 * An organisation's logo. Both logos are white artwork on a transparent background, so by default they
 * sit on a black tile to stay readable on light pages. Pass `transparent` where the surface behind is
 * already dark (the sidebar). Organisations without a logo show their name instead.
 *
 * Use `decorative` where the organisation's name is already written next to the logo.
 */
export function OrgLogo({
  slug,
  name,
  variant = 'mark',
  height = 40,
  decorative = false,
  transparent = false,
}: {
  slug: string;
  name: string;
  variant?: 'mark' | 'full';
  height?: number;
  decorative?: boolean;
  transparent?: boolean;
}) {
  const logo = LOGOS[slug];
  if (!logo) return <span className="logo-fallback">{name}</span>;
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${name} logo` };
  return (
    <span className={transparent ? 'logo-tile transparent' : 'logo-tile'} style={{ height, width: Math.round(height * TILE_RATIO) }} {...a11y}>
      <img src={logo[variant]} alt="" />
    </span>
  );
}

/** Logos for the sign-in page, which loads before the organisation list is available. */
export const SIGN_IN_ORGS = [
  { slug: 'alur', name: 'Alur' },
  { slug: 'felice', name: 'Felice' },
];

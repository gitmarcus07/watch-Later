import { colors, radius, spacing, typography } from '@/theme';

describe('theme tokens', () => {
  it('provides semantic colors and an ordered spacing scale', () => {
    expect(colors.background).toMatch(/^#/);
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(radius.pill).toBeGreaterThan(radius.card);
    expect(typography.heading1.fontSize).toBeGreaterThan(typography.body.fontSize);
  });
});

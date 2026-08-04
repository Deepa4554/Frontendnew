import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { InitialsAvatar } from './InitialsAvatar';

// render() is async in RTL-native v14 — always await it, then read via `screen`.
const bgColorOf = (node: any): string | undefined =>
  ([] as any[]).concat(node?.props?.style ?? []).reduce(
    (acc, s) => (s && s.backgroundColor ? s.backgroundColor : acc),
    undefined,
  );

describe('InitialsAvatar', () => {
  it('shows the first+last initial for a multi-word name', async () => {
    await render(<InitialsAvatar name="Deepa Jajoo" />);
    expect(screen.getByText('DJ')).toBeOnTheScreen();
  });

  it('shows the first two letters for a single-word name', async () => {
    await render(<InitialsAvatar name="Cappuccino" />);
    expect(screen.getByText('CA')).toBeOnTheScreen();
  });

  it('falls back to "?" for an empty/whitespace name', async () => {
    await render(<InitialsAvatar name="   " />);
    expect(screen.getByText('?')).toBeOnTheScreen();
  });

  it('is deterministic — the same name always gets the same background color', async () => {
    const a = await render(<InitialsAvatar name="Ravi Kumar" />);
    const firstColor = bgColorOf(a.getByText('RK').parent);
    a.unmount();

    await render(<InitialsAvatar name="Ravi Kumar" />);
    const secondColor = bgColorOf(screen.getByText('RK').parent);

    expect(firstColor).toBeDefined();
    expect(firstColor).toBe(secondColor);
  });
});

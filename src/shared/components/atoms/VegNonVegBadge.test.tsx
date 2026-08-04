import React from 'react';
import { render } from '@testing-library/react-native';
import { VegNonVegBadge } from './VegNonVegBadge';

// This atom has no provider dependencies, so plain RTL render is enough.
// (render() is async in RTL-native v14 — always await it.) We inspect the
// rendered tree via toJSON() rather than UNSAFE_* queries, which the v14 render
// result no longer exposes directly.
const flatten = (style: any): any =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : style ?? {};

const boxOf = (tree: any) => tree; // outer View
const markOf = (tree: any) => (Array.isArray(tree.children) ? tree.children[0] : undefined);

describe('VegNonVegBadge', () => {
  it('renders nothing when type is null/undefined', async () => {
    const { toJSON, rerender } = await render(<VegNonVegBadge type={null} />);
    expect(toJSON()).toBeNull();
    rerender(<VegNonVegBadge type={undefined} />);
    expect(toJSON()).toBeNull();
  });

  it('renders a green circular mark for Veg and Jain', async () => {
    for (const type of ['Veg', 'Jain'] as const) {
      const { toJSON } = await render(<VegNonVegBadge type={type} />);
      const mark = markOf(toJSON());
      expect(flatten(mark.props.style).backgroundColor).toBe('#0B8043');
    }
  });

  it('renders an amber circular mark for Eggetarian', async () => {
    const { toJSON } = await render(<VegNonVegBadge type="Eggetarian" />);
    expect(flatten(markOf(toJSON()).props.style).backgroundColor).toBe('#B26A00');
  });

  it('renders a maroon triangle (no filled circle) for NonVeg', async () => {
    const { toJSON } = await render(<VegNonVegBadge type="NonVeg" />);
    const style = flatten(markOf(toJSON()).props.style);
    // Triangle is drawn via borders, not a background fill.
    expect(style.borderBottomColor).toBe('#B71C1C');
    expect(style.backgroundColor).toBeUndefined();
  });

  it('scales the box to the given size and tints the border by type', async () => {
    const { toJSON } = await render(<VegNonVegBadge type="Veg" size={30} />);
    const box = flatten(boxOf(toJSON()).props.style);
    expect(box.width).toBe(30);
    expect(box.height).toBe(30);
    expect(box.borderColor).toBe('#0B8043');
  });
});

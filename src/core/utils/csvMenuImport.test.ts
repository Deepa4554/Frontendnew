import { normalizeMenuCsvRows } from './csvMenuImport';

describe('normalizeMenuCsvRows', () => {
  it('maps the core columns onto a CreateMenuItemRequest', () => {
    const [item] = normalizeMenuCsvRows([
      { name: 'Cappuccino', category: 'Beverages', price: '120', subtitle: 'Rich', description: 'Hot coffee' },
    ]);
    expect(item).toMatchObject({
      name: 'Cappuccino',
      category: 'Beverages',
      price: 120,
      subtitle: 'Rich',
      description: 'Hot coffee',
    });
  });

  it('matches column headers case-insensitively and trims whitespace', () => {
    const [item] = normalizeMenuCsvRows([
      { '  NAME  ': '  Latte  ', Price: ' 99 ', CATEGORY: ' Coffee ' },
    ]);
    expect(item.name).toBe('Latte');
    expect(item.price).toBe(99);
    expect(item.category).toBe('Coffee');
  });

  it('defaults a missing/blank category to "Food"', () => {
    const [item] = normalizeMenuCsvRows([{ name: 'Samosa', price: '20' }]);
    expect(item.category).toBe('Food');
  });

  it('leaves subtitle/description undefined when blank', () => {
    const [item] = normalizeMenuCsvRows([{ name: 'Tea', price: '15', subtitle: '', description: '' }]);
    expect(item.subtitle).toBeUndefined();
    expect(item.description).toBeUndefined();
  });

  it('drops rows with no name, non-numeric price, or price <= 0', () => {
    const result = normalizeMenuCsvRows([
      { name: '', price: '50' }, // no name
      { name: 'Bad', price: 'abc' }, // NaN price
      { name: 'Free', price: '0' }, // zero price
      { name: 'Negative', price: '-5' }, // negative price
      { name: 'Valid', price: '10' }, // keeper
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });

  describe('veg/non-veg cell parsing', () => {
    it.each([
      ['Veg', 'Veg'],
      ['vegetarian', 'Veg'],
      ['V', 'Veg'],
      ['non-veg', 'NonVeg'],
      ['NonVeg', 'NonVeg'],
      ['N', 'NonVeg'],
      ['jain', 'Jain'],
      ['egg', 'Eggetarian'],
      ['eggetarian', 'Eggetarian'],
    ])('maps "%s" -> %s', (raw, expected) => {
      const [item] = normalizeMenuCsvRows([{ name: 'X', price: '10', veg: raw }]);
      expect(item.vegNonVegType).toBe(expected);
    });

    it('reads the tag from the "type" or "vegnonveg" column as a fallback', () => {
      const [byType] = normalizeMenuCsvRows([{ name: 'X', price: '10', type: 'jain' }]);
      expect(byType.vegNonVegType).toBe('Jain');
      const [byVegNonVeg] = normalizeMenuCsvRows([{ name: 'Y', price: '10', vegnonveg: 'egg' }]);
      expect(byVegNonVeg.vegNonVegType).toBe('Eggetarian');
    });

    it('leaves an unrecognized or blank tag untagged (undefined)', () => {
      const [item] = normalizeMenuCsvRows([{ name: 'X', price: '10', veg: 'maybe' }]);
      expect(item.vegNonVegType).toBeUndefined();
    });
  });
});

import { augmentCategoryGroups, categoryAugmentations } from '../src/category-augmentation';

describe('augmentCategoryGroups', () => {
  it('passes categories without augmentation entries through unchanged', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Group A',
        categories: [{ id: 'c1', name: 'Unknown Cat' }],
      },
    ];

    const result = augmentCategoryGroups(groups);

    expect(result).toHaveLength(1);
    expect(result[0].categories).toHaveLength(1);
    expect(result[0].categories[0].id).toBe('c1');
    expect(result[0].categories[0].description).toBeUndefined();
    expect(result[0].categories[0].examples).toBeUndefined();
    expect(result[0].categories[0].disambiguation).toBeUndefined();
  });

  it('injects description, examples and disambiguation for known categories', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Usual Expenses',
        categories: [{ id: 'c-vers', name: 'Versicherungen' }],
      },
    ];

    const result = augmentCategoryGroups(groups);
    const cat = result[0].categories[0];

    expect(cat.id).toBe('c-vers');
    expect(cat.description).toMatch(/Versicherungen/);
    expect(cat.examples).toEqual(expect.arrayContaining(['Allianz']));
    expect(cat.disambiguation).toMatch(/Bausparen/);
  });

  it('filters out categories marked excludeFromPrompt', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Special',
        categories: [
          { id: 'c-keep', name: 'Bar' },
          { id: 'c-drop', name: 'UNBEKANNT' },
          { id: 'c-drop2', name: 'Allgemein' },
          { id: 'c-drop3', name: 'Benzin' },
        ],
      },
    ];

    const result = augmentCategoryGroups(groups);

    expect(result[0].categories).toHaveLength(1);
    expect(result[0].categories[0].name).toBe('Bar');
  });

  it('drops a group entirely when all its categories are excluded', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Catchalls',
        categories: [
          { id: 'c1', name: 'UNBEKANNT' },
          { id: 'c2', name: 'Allgemein' },
        ],
      },
      {
        id: 'g2',
        name: 'Real',
        categories: [{ id: 'c3', name: 'Versicherungen' }],
      },
    ];

    const result = augmentCategoryGroups(groups);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Real');
  });

  it('handles groups with null/undefined categories', () => {
    interface Cat { id: string; name: string }
    interface Group { id: string; name: string; categories?: Cat[] | null }
    const groups: Group[] = [
      { id: 'g1', name: 'Empty A', categories: null },
      { id: 'g2', name: 'Empty B', categories: undefined },
      {
        id: 'g3',
        name: 'Has',
        categories: [{ id: 'c1', name: 'Versicherungen' }],
      },
    ];

    const result = augmentCategoryGroups(groups);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Has');
  });

  it('merges Essen+Ausgehen by excluding "Ausgehen (non-food)"', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Special',
        categories: [
          { id: 'c-essen', name: 'Essen (Take Away / Ausgehen)' },
          { id: 'c-ausgehen', name: 'Ausgehen (non-food)' },
        ],
      },
    ];

    const result = augmentCategoryGroups(groups);

    expect(result[0].categories).toHaveLength(1);
    expect(result[0].categories[0].name).toBe('Essen (Take Away / Ausgehen)');
    expect(result[0].categories[0].description).toMatch(/zusammengelegt/);
  });

  it('makes Petra and Sebastian Hobby skip-tolerant via disambiguation', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Special',
        categories: [
          { id: 'c-petra', name: 'Petra Hobby' },
          { id: 'c-sebastian', name: 'Sebastian Hobby' },
        ],
      },
    ];

    const result = augmentCategoryGroups(groups);

    expect(result[0].categories[0].disambiguation).toMatch(/skippen statt raten/);
    expect(result[0].categories[1].disambiguation).toMatch(/skippen statt raten/);
  });

  it('is consistent: every augmentation entry either has content or excludeFromPrompt', () => {
    Object.entries(categoryAugmentations).forEach(([name, aug]) => {
      const hasContent = Boolean(aug.description ?? aug.examples ?? aug.disambiguation);
      const isExcluded = aug.excludeFromPrompt === true;
      expect(hasContent || isExcluded).toBe(true);
      if (isExcluded) {
        expect(typeof name).toBe('string');
      }
    });
  });
});

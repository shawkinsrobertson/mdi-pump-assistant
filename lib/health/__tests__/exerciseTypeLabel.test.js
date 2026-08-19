const { humanizeExerciseTypeKey, buildExerciseTypeLabels } = require('../exerciseTypeLabel');

describe('humanizeExerciseTypeKey', () => {
  it('title-cases a single word', () => {
    expect(humanizeExerciseTypeKey('BOXING')).toBe('Boxing');
  });

  it('splits underscores into separate title-cased words', () => {
    expect(humanizeExerciseTypeKey('BIKING_STATIONARY')).toBe('Biking Stationary');
  });

  it('handles a three-word key', () => {
    expect(humanizeExerciseTypeKey('HIGH_INTENSITY_INTERVAL_TRAINING')).toBe('High Intensity Interval Training');
  });
});

describe('buildExerciseTypeLabels', () => {
  it("reverses a { KEY: number } constants map into { number: 'Human Label' }", () => {
    const exerciseType = { OTHER_WORKOUT: 0, BOXING: 11, BIKING_STATIONARY: 9 };
    expect(buildExerciseTypeLabels(exerciseType)).toEqual({
      0: 'Other Workout',
      9: 'Biking Stationary',
      11: 'Boxing',
    });
  });
});

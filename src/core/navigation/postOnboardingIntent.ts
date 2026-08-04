/**
 * Ephemeral, single-use signal from the onboarding wizard to AppNavigator: which
 * screen to land on right after onboarding completes, instead of always defaulting
 * to the POS tab. Not Redux/persisted state — it only needs to survive the moment
 * between "onboarding just finished" and AppNavigator's first mount.
 */
let intent: 'Menu' | null = null;

export const setPostOnboardingIntent = (value: 'Menu' | null) => {
  intent = value;
};

export const consumePostOnboardingIntent = (): 'Menu' | null => {
  const value = intent;
  intent = null;
  return value;
};

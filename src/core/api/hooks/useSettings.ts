import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, UpdateSettingsRequest } from '../settingsApi';
import { queryKeys } from './queryKeys';

export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: settingsApi.get });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateSettingsRequest) => settingsApi.update(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
};

export const useNotificationCategoryPreferences = () =>
  useQuery({ queryKey: queryKeys.notificationCategoryPreferences, queryFn: settingsApi.notificationPreferences });

export const useUpdateNotificationCategoryPreference = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, enabled }: { category: string; enabled: boolean }) =>
      settingsApi.updateNotificationPreference(category, enabled),
    onSuccess: () => {
      // The ['settings'] prefix covers this list itself; the notifications key is separate and
      // needs its own nudge, because switching a category off for the cafe changes what every
      // staff member's own "My Notifications" list reports as enabledForCafe.
      qc.invalidateQueries({ queryKey: queryKeys.settings });
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
};

export const useCompleteOnboarding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => settingsApi.completeOnboarding(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
};

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSettings, useUpdateSettings } from '../../../../core/api/hooks/useSettings';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { OnboardingScaffold } from '../components/OnboardingScaffold';
import { pickImageAsDataUri } from '../../../../core/utils/imagePicker';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonBox } from '../../../../shared/components/atoms/Skeleton';
import { useResponsive } from '../../../../core/utils/useResponsive';

export const OnboardingWelcomeScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Pre-fill with the cafe name already given at signup — otherwise this screen
  // looks like it's asking the same question a second time with no memory of the
  // first answer. Only auto-fills while the user hasn't typed here themselves.
  useEffect(() => {
    if (!nameTouched && settings?.businessName) setName(settings.businessName);
  }, [settings?.businessName, nameTouched]);

  useEffect(() => {
    if (!logoDataUri && settings?.logoUrl) setLogoDataUri(settings.logoUrl);
  }, [settings?.logoUrl, logoDataUri]);

  const handlePickLogo = async () => {
    setUploadingLogo(true);
    try {
      const dataUri = await pickImageAsDataUri();
      if (!dataUri) return; // user closed the file dialog without choosing anything
      setLogoDataUri(dataUri);
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : 'Could not upload logo', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleNext = () => {
    if (!name.trim()) {
      dispatch(showToast({ message: 'Enter your cafe name to continue.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    updateSettings.mutate({
      businessName: name.trim() || undefined,
      primaryColor: COLORS.vibeEspresso,
      logoUrl: logoDataUri ?? undefined,
    });
    navigation.navigate('OnboardingType');
  };

  return (
    <OnboardingScaffold step={1} onNext={handleNext}>
      <Text style={styles.headline}>Welcome Home.</Text>
      <Text style={styles.subtitle}>
        Let's start by giving your cafe a digital identity that feels as warm as your first brew of
        the morning.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>What's the name of your cafe?</Text>
        {isLoading ? (
          <SkeletonBox height={54} radius={8} />
        ) : (
          <View style={styles.inputWrapper}>
            <View style={styles.nameInputWrap}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(t) => { setName(t); setNameTouched(true); }}
                placeholder="e.g., The Golden Bean"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>
            <Icon name="pencil-outline" size={18} color={COLORS.muted} />
          </View>
        )}

        <Text style={[styles.label, { marginTop: 24 }]}>Upload your logo</Text>
        {isLoading ? (
          <SkeletonBox height={140} radius={8} />
        ) : (
          <TouchableOpacity style={styles.dropzone} activeOpacity={0.7} onPress={handlePickLogo} disabled={uploadingLogo}>
            {logoDataUri ? (
              <>
                <Image source={{ uri: logoDataUri }} style={styles.logoPreview} />
                <Text style={styles.dropzoneTitle}>Tap to choose a different logo</Text>
              </>
            ) : (
              <>
                <View style={styles.dropzoneIcon}>
                  {uploadingLogo ? <ActivityIndicator size="small" color={COLORS.muted} /> : <Icon name="camera-plus-outline" size={26} color={COLORS.muted} />}
                </View>
                <Text style={styles.dropzoneTitle}>Click to browse or drag and drop</Text>
                <Text style={styles.dropzoneHint}>PNG, JPG or SVG — auto-resized on upload</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.proTip}>
        <Icon name="lightbulb-on-outline" size={18} color={COLORS.accent} />
        <Text style={styles.proTipText}>
          <Text style={styles.proTipBold}>Pro Tip: </Text>
          Your logo looks best on a transparent background. If you don't have one yet, you can skip
          this and add it later!
        </Text>
      </View>
    </OnboardingScaffold>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  headline: {
    fontSize: isDesktopWeb ? 32 : 12,
    fontWeight: '800',
    color: COLORS.heading,
    textAlign: 'center',
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  subtitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: isDesktopWeb ? 24 : 18,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
  },
  card: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 22 : 16.5,
    shadowColor: '#4A2C1D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  label: {
    fontSize: isDesktopWeb ? 17 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputTint,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    height: 54,
  },
  nameInputWrap: {
    flex: 1,
    borderRadius: 8,
  },
  input: {
    width: '100%',
    fontSize: 16,
    color: COLORS.heading,
  },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 28 : 21,
    alignItems: 'center',
  },
  dropzoneIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.inputTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  logoPreview: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: isDesktopWeb ? 12 : 9,
    backgroundColor: COLORS.inputTint,
  },
  dropzoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  dropzoneHint: {
    fontSize: 12,
    color: COLORS.muted,
  },
  proTip: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 10 : 7.5,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 8,
    padding: isDesktopWeb ? 16 : 12,
    marginTop: isDesktopWeb ? 20 : 15,
  },
  proTipText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.heading,
    lineHeight: 19,
  },
  proTipBold: {
    fontWeight: '700',
    color: COLORS.accent,
  },
});

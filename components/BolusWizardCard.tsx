import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeBolusWizard } from '../lib/bolus';
import { DuplicateTreatmentError, getTreatmentsSince, insertTreatment, type EventType } from '../lib/db/treatments';
import { computeIOB } from '../lib/iob';
import { useSettings } from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import { Card } from './ui/Card';

interface BolusWizardCardProps {
  currentBG: number | null;
  onLogged?: () => void;
}

// Inline collapsible version of the Bolus Wizard, matching the reference
// mockup (title + chevron, collapsed by default; expands in place on
// Dashboard) — replaces the old QuickLogModal, which opened as a
// separate full-screen modal. Logic is unchanged from that modal, just
// re-hosted inline and made theme-aware.
export function BolusWizardCard({ currentBG, onLogged }: BolusWizardCardProps) {
  const { colors, spacing, radius, fontScale } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, fontScale), [colors, spacing, radius, fontScale]);

  const [expanded, setExpanded] = useState(false);
  const [settings, , settingsLoaded] = useSettings();
  const [logType, setLogType] = useState<EventType>('Meal Bolus');
  const [carbs, setCarbs] = useState('');
  const [insulinOverride, setInsulinOverride] = useState('');
  const [edited, setEdited] = useState(false);
  // null = not yet loaded / failed to load — must not be treated as 0.
  // A failed IOB fetch that silently defaulted to "no insulin on board"
  // would let the wizard suggest a dose that ignores insulin the user
  // may already have on board (AGENTS.md: never let a bad state
  // silently feed the calculator).
  const [iob, setIob] = useState<number | null>(null);
  const [iobError, setIobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const settingsReady =
    settingsLoaded && settings.isf != null && settings.carbRatio != null && settings.targetBG != null && settings.dia != null;

  // Recompute IOB from the DIA-hour window every time the card expands —
  // matches the wizard's "current" moment rather than a stale value from
  // whenever it was last opened.
  useEffect(() => {
    if (!expanded || !settingsReady || settings.dia == null) return;
    let cancelled = false;
    setIob(null);
    setIobError(null);
    const since = new Date(Date.now() - settings.dia * 3_600_000).toISOString();
    getTreatmentsSince(since)
      .then((treatments) => {
        if (cancelled) return;
        setIob(computeIOB(treatments, settings.dia!, Date.now()));
      })
      .catch((e) => {
        if (cancelled) return;
        setIobError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, settingsReady, settings.dia]);

  const carbsNum = parseFloat(carbs) || 0;

  const wizard = useMemo(() => {
    if (!settingsReady || settings.isf == null || settings.carbRatio == null || settings.targetBG == null || iob == null) {
      return null;
    }
    return computeBolusWizard({
      carbs: carbsNum,
      currentBG,
      iob,
      carbRatio: settings.carbRatio,
      isf: settings.isf,
      targetBG: settings.targetBG,
      penIncrement: settings.penIncrement,
    });
  }, [settingsReady, settings, carbsNum, currentBG, iob]);

  const finalInsulin = edited ? parseFloat(insulinOverride) || 0 : (wizard?.suggested ?? 0);

  const commit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await insertTreatment({
        eventType: logType,
        insulin: finalInsulin > 0 ? finalInsulin : null,
        carbs: carbsNum > 0 ? carbsNum : null,
        createdAt: new Date().toISOString(),
      });
      setCarbs('');
      setInsulinOverride('');
      setEdited(false);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 2000);
      onLogged?.();
    } catch (e) {
      if (e instanceof DuplicateTreatmentError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [logType, finalInsulin, carbsNum, onLogged]);

  const handleSubmit = useCallback(() => {
    Alert.alert(
      'Log this treatment?',
      `${finalInsulin > 0 ? `${finalInsulin.toFixed(2)} U insulin` : ''}${finalInsulin > 0 && carbsNum > 0 ? ' · ' : ''}${carbsNum > 0 ? `${carbsNum} g carbs` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log', onPress: commit },
      ],
    );
  }, [commit, finalInsulin, carbsNum]);

  return (
    <Card style={styles.card}>
      <Pressable style={styles.headerRow} onPress={() => setExpanded((e) => !e)}>
        <Text style={styles.title}>Bolus Wizard</Text>
        <View style={styles.headerRight}>
          {confirmed && <Text style={styles.confirmed}>Logged ✓</Text>}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.text.tertiary} />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {!settingsReady ? (
            <Text style={styles.message}>
              Set your ISF, carb ratio, target BG, and DIA in Settings before using the bolus wizard.
            </Text>
          ) : (
            <>
              <View style={styles.toggleRow}>
                {(['Meal Bolus', 'Correction Bolus'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.toggleButton, logType === t && styles.toggleButtonActive]}
                    onPress={() => setLogType(t)}
                  >
                    <Text style={[styles.toggleText, logType === t && styles.toggleTextActive]}>
                      {t === 'Meal Bolus' ? 'Meal' : 'Correction'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Insulin to log (U)</Text>
                <TextInput
                  style={styles.input}
                  value={edited ? insulinOverride : (wizard?.suggested.toFixed(2) ?? '')}
                  onChangeText={(text) => {
                    setEdited(true);
                    setInsulinOverride(text);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={wizard ? undefined : 'Enter manually'}
                  placeholderTextColor={colors.text.placeholder}
                />
                {edited && wizard && (
                  <Pressable
                    onPress={() => {
                      setEdited(false);
                      setInsulinOverride('');
                    }}
                  >
                    <Text style={styles.resetLink}>Reset to suggested</Text>
                  </Pressable>
                )}
              </View>

              {wizard ? (
                <View style={styles.breakdown}>
                  <Text style={styles.breakdownText}>
                    Current BG: {currentBG != null ? `${currentBG} mg/dL` : 'unavailable'}
                  </Text>
                  <Text style={styles.breakdownText}>
                    Meal {wizard.mealDose.toFixed(2)} U + correction {wizard.correction.toFixed(2)} U − IOB{' '}
                    {wizard.iob.toFixed(2)} U = {wizard.suggested.toFixed(2)} U
                  </Text>
                  {currentBG == null && (
                    <Text style={styles.breakdownNote}>No current BG available — correction term is 0.</Text>
                  )}
                </View>
              ) : (
                <View style={styles.breakdown}>
                  <Text style={styles.breakdownNote}>
                    {iobError
                      ? `Could not verify insulin already on board (${iobError}) — refusing to suggest a dose. Enter the dose manually if you want to log one.`
                      : 'Checking insulin already on board…'}
                  </Text>
                </View>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.button, submitting && styles.buttonDisabled]}
                disabled={submitting || (carbsNum <= 0 && finalInsulin <= 0)}
                onPress={handleSubmit}
              >
                {submitting ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.buttonText}>Log</Text>}
              </Pressable>
            </>
          )}
        </View>
      )}
    </Card>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  spacing: ReturnType<typeof useTheme>['spacing'],
  radius: ReturnType<typeof useTheme>['radius'],
  fontScale: number,
) {
  return StyleSheet.create({
    card: {
      width: '100%',
      marginTop: spacing.base,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      fontSize: 16 * fontScale,
      fontWeight: '700',
      color: colors.text.primary,
    },
    confirmed: {
      color: colors.status.success,
      fontWeight: '600',
      fontSize: 13 * fontScale,
    },
    body: {
      marginTop: spacing.base,
    },
    message: {
      fontSize: 14 * fontScale,
      color: colors.text.secondary,
    },
    toggleRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.base,
    },
    toggleButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: colors.bg.primary,
    },
    toggleButtonActive: {
      borderColor: colors.action.primaryBg,
      backgroundColor: colors.action.primaryBg,
    },
    toggleText: {
      color: colors.text.secondary,
      fontWeight: '600',
      fontSize: 14 * fontScale,
    },
    toggleTextActive: {
      color: colors.text.inverse,
    },
    field: {
      marginBottom: spacing.base,
    },
    label: {
      fontSize: 14 * fontScale,
      fontWeight: '600',
      color: colors.text.label,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.smMd,
      fontSize: 16 * fontScale,
      color: colors.text.primary,
    },
    resetLink: {
      fontSize: 12 * fontScale,
      color: colors.text.tertiary,
      textDecorationLine: 'underline',
      marginTop: spacing.xs,
    },
    breakdown: {
      backgroundColor: colors.bg.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.base,
    },
    breakdownText: {
      fontSize: 13 * fontScale,
      color: colors.text.label,
    },
    breakdownNote: {
      fontSize: 12 * fontScale,
      color: colors.status.danger,
      marginTop: spacing.xs,
    },
    error: {
      color: colors.status.danger,
      fontSize: 13 * fontScale,
      marginBottom: spacing.md,
    },
    button: {
      backgroundColor: colors.action.primaryBg,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.text.inverse,
      fontWeight: '600',
      fontSize: 15 * fontScale,
    },
  });
}

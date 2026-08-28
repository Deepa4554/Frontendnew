import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { showToast } from '../../../core/store/uiSlice';
import { useDeliverySettings, useDeliveryStatus, useDeliveryQuote, useBookRider } from '../../../core/api/hooks/useDelivery';

/**
 * Books a courier for one delivery order — the cafe-side half of the delivery QR flow.
 *
 * Nothing here happens on its own. The kitchen picks how long the food needs and presses Book
 * rider; that press is what hires a person and charges the cafe's Borzo balance, which is why
 * the price is shown first, the button says which mode it's in, and a booked order shows the
 * rider instead of the button rather than offering to book again.
 *
 * Rendered only for DELIVERY orders. It stays silent (renders nothing) when the cafe hasn't set
 * a courier up at all, so a cafe that does its own deliveries never sees it.
 */
export const RiderBookingCard = ({ orderId }: { orderId: number }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  const dispatch = useDispatch();

  const { data: settings } = useDeliverySettings();
  const { data: status } = useDeliveryStatus(orderId);
  const { mutate: book, isPending: booking } = useBookRider();
  const [prepMinutes, setPrepMinutes] = useState(20);

  const alreadyBooked = !!status?.courierOrderId;
  // Quoting calls out to Borzo, so it's only worth doing when a booking is actually possible
  // and hasn't already happened.
  const { data: quote, isLoading: quoting } = useDeliveryQuote(
    orderId,
    !!settings?.readyToBook && !alreadyBooked,
  );

  // A cafe with no courier configured shouldn't see courier UI at all.
  if (!settings?.enabled) return null;

  const handleBook = () =>
    book(
      { orderId, prepMinutes },
      {
        onSuccess: () => dispatch(showToast({ message: 'Rider booked.', icon: 'moped', tone: 'success' })),
        onError: (err: any) =>
          dispatch(showToast({
            message: err?.response?.data?.title || err?.message || 'Could not book a rider.',
            icon: 'alert-circle-outline',
            tone: 'danger',
          })),
      },
    );

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="moped" size={16} color={COLORS.accent} />
        <Text style={styles.title}>Delivery rider</Text>
        {!settings.useTestEnvironment && <View style={styles.liveTag}><Text style={styles.liveTagText}>LIVE</Text></View>}
      </View>

      {alreadyBooked ? (
        <>
          <Text style={styles.line}>
            {status?.riderName ? `Rider: ${status.riderName}` : 'Rider being assigned…'}
            {status?.status ? ` · ${status.status}` : ''}
          </Text>
          {status?.fee != null && <Text style={styles.line}>Courier charge: ₹{status.fee.toFixed(2)}</Text>}
          <View style={styles.btnRow}>
            {!!status?.riderPhone && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(`tel:${status.riderPhone}`)}>
                <Icon name="phone" size={14} color={COLORS.accent} />
                <Text style={styles.secondaryBtnText}>Call rider</Text>
              </TouchableOpacity>
            )}
            {!!status?.trackingUrl && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(status.trackingUrl as string)}>
                <Icon name="map-marker-path" size={14} color={COLORS.accent} />
                <Text style={styles.secondaryBtnText}>Track</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : !settings.readyToBook ? (
        <Text style={styles.blocked}>
          Finish setup in Integrations → Delivery Partner before booking a rider.
        </Text>
      ) : status && !status.hasLocation ? (
        // The customer ordered without sharing a location. The order is perfectly valid — it just
        // can't be routed automatically, and saying so beats a failure at the moment of booking.
        <Text style={styles.blocked}>
          This customer didn’t share a map location, so a rider can’t be booked automatically.
          Deliver it yourself, or call them for directions.
        </Text>
      ) : (
        <>
          <Text style={styles.label}>Food ready in</Text>
          <View style={styles.prepRow}>
            {[10, 20, 30, 45].map((minutes) => (
              <TouchableOpacity
                key={minutes}
                style={[styles.prepPill, prepMinutes === minutes && styles.prepPillActive]}
                onPress={() => setPrepMinutes(minutes)}
              >
                <Text style={[styles.prepText, prepMinutes === minutes && styles.prepTextActive]}>{minutes}m</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            The rider is timed to arrive then, instead of waiting at your counter.
          </Text>

          <Text style={styles.line}>
            {quoting
              ? 'Checking price…'
              : quote?.fee != null
                ? `Courier charge: ₹${quote.fee.toFixed(2)}${quote.passedToCustomer ? ' (added to the bill)' : ' (paid by the cafe)'}`
                : quote?.message || 'Price unavailable — you can still try booking.'}
          </Text>

          <TouchableOpacity style={styles.bookBtn} onPress={handleBook} disabled={booking}>
            {booking ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="moped" size={15} color="#FFFFFF" />}
            <Text style={styles.bookBtnText}>
              {booking ? 'Booking…' : settings.useTestEnvironment ? 'Book rider (sandbox)' : 'Book rider'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 12, marginTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '800', color: COLORS.heading, flex: 1 },
  liveTag: { backgroundColor: COLORS.dangerAccent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  liveTagText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.muted, marginTop: 10 },
  prepRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  prepPill: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.inputBorder,
  },
  prepPillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  prepText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  prepTextActive: { color: '#FFFFFF' },
  hint: { fontSize: 11, color: COLORS.muted, marginTop: 5, lineHeight: 15 },
  line: { fontSize: 12, color: COLORS.heading, marginTop: 8 },
  blocked: { fontSize: 12, color: COLORS.muted, marginTop: 8, lineHeight: 17 },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, borderRadius: 6, paddingVertical: 10, marginTop: 10,
  },
  bookBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 6, paddingVertical: 9,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
});

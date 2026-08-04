import { getItem, setItem, getBoolean } from '../storage/mmkv';

const STATION_STORAGE_KEY = 'kds_default_station';
const LOCKED_STORAGE_KEY = 'kds_station_locked';

/** Which station this KDS terminal shows by default — a per-device setting (a tablet
 * mounted in the Tandoor section should keep showing Tandoor after every reload/logout,
 * not reset to "All Stations"), same reasoning as printerConfig.ts's per-device storage. */
export const getKdsDefaultStation = (): string => getItem(STATION_STORAGE_KEY) ?? 'ALL';

export const saveKdsDefaultStation = (stationName: string) => {
  setItem(STATION_STORAGE_KEY, stationName);
};

/** When locked, this terminal's station can't be changed from the KDS screen itself
 * (the station-tab row hides) — for a kitchen display permanently mounted at one
 * station, so a passing staff member can't accidentally switch it to "All Stations". */
export const getKdsLocked = (): boolean => getBoolean(LOCKED_STORAGE_KEY) ?? false;

export const saveKdsLocked = (locked: boolean) => {
  setItem(LOCKED_STORAGE_KEY, locked);
};

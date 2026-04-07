import type { Database } from 'sqlite';
import type { AppConfig } from '../config/schema.js';
import { applySensitivityPolicy, type EventView } from '../policy/index.js';

export const BRIDGE_SCHEMA_VERSION = '1.0';

type DataSource = 'MEASURED' | 'MANUAL' | 'ESTIMATED' | 'UNAVAILABLE';

interface ParsedEvent {
  id: string;
  category: string;
  ts: string;
  payload: Record<string, unknown>;
}

interface NumericField {
  value: number | null;
  source: DataSource;
}

interface SnapshotView {
  date: string;
  weightKg: number | null;
  heightM: number | null;
  bmi: number | null;
  stepCount: number | null;
  sleepHours: number | null;
  caloriesConsumed: number | null;
  activeCaloriesBurned: number | null;
  totalCaloriesBurned: number | null;
  workoutCount: number;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  recoveryScore: number | null;
  flags: string[];
  dataAvailability: Record<string, DataSource>;
}

interface WorkoutItem {
  id: string;
  startTime: string;
  endTime: string;
  workoutType: string;
  completed: boolean;
}

interface NutritionItem {
  id: string;
  timestamp: string;
  mealName: string;
  calories: number;
}

interface RecoveryItem {
  id: string;
  timestamp: string;
  sleepHours: number | null;
  fatigueLevel: number;
  stressLevel: number;
}

interface PrItem {
  id: string;
  exerciseName: string;
  prType: string;
  value: number;
  unit: string;
  achievedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findValue(input: unknown, aliases: string[], depth = 2): unknown {
  const normalizedAliases = new Set(aliases.map(normalizeKey));
  return findValueInternal(input, normalizedAliases, depth);
}

function findValueInternal(input: unknown, aliases: Set<string>, depth: number): unknown {
  if (Array.isArray(input)) {
    for (const item of input) {
      const nested = findValueInternal(item, aliases, depth - 1);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  if (!isRecord(input) || depth < 0) {
    return undefined;
  }

  for (const [key, value] of Object.entries(input)) {
    if (aliases.has(normalizeKey(key))) {
      return value;
    }
  }

  if (depth === 0) {
    return undefined;
  }

  for (const value of Object.values(input)) {
    const nested = findValueInternal(value, aliases, depth - 1);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function getNumber(input: unknown, aliases: string[]): number | undefined {
  const value = findValue(input, aliases);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getString(input: unknown, aliases: string[]): string | undefined {
  const value = findValue(input, aliases);
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function getBoolean(input: unknown, aliases: string[]): boolean | undefined {
  const value = findValue(input, aliases);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

function hasAny(input: unknown, aliases: string[]): boolean {
  return findValue(input, aliases) !== undefined;
}

function parsePayload(payloadJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payloadJson);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toIsoString(value: string | undefined, fallback: string): string {
  const parsed = value ? new Date(value) : new Date(fallback);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallback).toISOString();
  }
  return parsed.toISOString();
}

function inferDataSource(input: unknown, fallback: DataSource): DataSource {
  const raw = getString(input, ['dataSource', 'sourceType', 'source']);
  if (!raw) return fallback;

  const normalized = normalizeKey(raw);
  if (normalized.includes('manual')) return 'MANUAL';
  if (normalized.includes('estimated')) return 'ESTIMATED';
  if (normalized.includes('unavailable')) return 'UNAVAILABLE';
  if (normalized.includes('measured') || normalized.includes('healthconnect')) return 'MEASURED';
  return fallback;
}

function clampLimit(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 100);
}

function sameDay(isoTimestamp: string, date: string): boolean {
  return isoTimestamp.slice(0, 10) === date;
}

function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function createNumericField(events: ParsedEvent[], aliases: string[]): NumericField {
  for (const event of events) {
    const value = getNumber(event.payload, aliases);
    if (value !== undefined) {
      return {
        value,
        source: inferDataSource(event.payload, 'MEASURED')
      };
    }
  }

  return { value: null, source: 'UNAVAILABLE' };
}

function createSummedField(events: ParsedEvent[], aliases: string[]): NumericField {
  let total = 0;
  let matched = false;
  let source: DataSource = 'UNAVAILABLE';

  for (const event of events) {
    const value = getNumber(event.payload, aliases);
    if (value === undefined) continue;
    total += value;
    matched = true;
    if (source === 'UNAVAILABLE') {
      source = inferDataSource(event.payload, 'MEASURED');
    }
  }

  return {
    value: matched ? round(total) : null,
    source: matched ? source : 'UNAVAILABLE'
  };
}

function buildSnapshotView(events: ParsedEvent[], date: string): SnapshotView | null {
  const dayEvents = events.filter((event) => sameDay(event.ts, date));
  if (dayEvents.length === 0) return null;

  const upToDayEvents = events.filter((event) => new Date(event.ts) <= endOfDay(date));
  const weightKg = createNumericField(upToDayEvents, ['weightKg', 'weight']);
  const heightM = createNumericField(upToDayEvents, ['heightM', 'heightMeters', 'height']);
  const stepCount = createSummedField(dayEvents, ['stepCount', 'steps']);
  const sleepHours = createSummedField(dayEvents, ['sleepHours', 'hoursSlept', 'durationHours']);
  const caloriesConsumed = createSummedField(dayEvents, ['caloriesConsumed', 'calories', 'energyKcal']);
  const activeCaloriesBurned = createSummedField(dayEvents, ['activeCaloriesBurned', 'activeCalories', 'caloriesBurned']);
  const totalCaloriesBurned = createSummedField(dayEvents, ['totalCaloriesBurned', 'totalCalories', 'burnedCalories']);
  const proteinGrams = createSummedField(dayEvents, ['proteinGrams', 'protein']);
  const carbsGrams = createSummedField(dayEvents, ['carbsGrams', 'carbs', 'carbohydratesGrams']);
  const fatGrams = createSummedField(dayEvents, ['fatGrams', 'fat']);
  const recoveryScore = createNumericField(dayEvents, ['recoveryScore']);
  const fatigueLevel = createNumericField(dayEvents, ['fatigueLevel', 'fatigue']);
  const stressLevel = createNumericField(dayEvents, ['stressLevel', 'stress']);
  const workoutCount = extractWorkoutItems(dayEvents).length;

  const flags: string[] = [];
  if ((sleepHours.value ?? Number.POSITIVE_INFINITY) < 6) flags.push('LOW_SLEEP');
  if ((fatigueLevel.value ?? 0) >= 7) flags.push('HIGH_FATIGUE');
  if ((stressLevel.value ?? 0) >= 7) flags.push('ELEVATED_STRESS');
  if (workoutCount === 0 && dayEvents.some((event) => event.category === 'activity')) flags.push('LOW_ADHERENCE');

  const weightValue = weightKg.value;
  const heightValue = heightM.value;
  const bmi = weightValue !== null && heightValue !== null && heightValue > 0
    ? round(weightValue / (heightValue * heightValue))
    : null;

  return {
    date,
    weightKg: weightValue,
    heightM: heightValue,
    bmi,
    stepCount: stepCount.value,
    sleepHours: sleepHours.value,
    caloriesConsumed: caloriesConsumed.value,
    activeCaloriesBurned: activeCaloriesBurned.value,
    totalCaloriesBurned: totalCaloriesBurned.value ?? activeCaloriesBurned.value,
    workoutCount,
    proteinGrams: proteinGrams.value,
    carbsGrams: carbsGrams.value,
    fatGrams: fatGrams.value,
    recoveryScore: recoveryScore.value !== null ? Math.round(recoveryScore.value) : null,
    flags,
    dataAvailability: {
      weightKg: weightKg.source,
      heightM: heightM.source,
      stepCount: stepCount.source,
      sleepHours: sleepHours.source,
      caloriesConsumed: caloriesConsumed.source,
      activeCaloriesBurned: activeCaloriesBurned.source,
      totalCaloriesBurned: totalCaloriesBurned.value !== null ? totalCaloriesBurned.source : activeCaloriesBurned.source,
      proteinGrams: proteinGrams.source,
      carbsGrams: carbsGrams.source,
      fatGrams: fatGrams.source,
      recoveryScore: recoveryScore.source
    }
  };
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);

  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

function inDateRange(isoTimestamp: string, start: string, end: string): boolean {
  const date = isoTimestamp.slice(0, 10);
  return date >= start && date <= end;
}

function sortByTimestampDesc<T>(items: T[], getTimestamp: (item: T) => string): T[] {
  return [...items].sort((left, right) => Date.parse(getTimestamp(right)) - Date.parse(getTimestamp(left)));
}

function extractWorkoutItems(events: ParsedEvent[]): WorkoutItem[] {
  const workouts = events.flatMap((event) => {
    if (event.category !== 'activity') return [];

    const looksLikeWorkout = hasAny(event.payload, [
      'workoutType',
      'activityType',
      'startTime',
      'startedAt',
      'endTime',
      'endedAt',
      'completed'
    ]);
    if (!looksLikeWorkout) return [];

    const startTime = toIsoString(getString(event.payload, ['startTime', 'startedAt', 'start']), event.ts);
    const endTime = toIsoString(getString(event.payload, ['endTime', 'endedAt', 'end']), startTime);

    return [{
      id: event.id,
      startTime,
      endTime,
      workoutType: getString(event.payload, ['workoutType', 'activityType', 'type']) ?? 'Workout',
      completed: getBoolean(event.payload, ['completed', 'isCompleted']) ?? true
    }];
  });

  return sortByTimestampDesc(workouts, (item) => item.startTime);
}

function extractNutritionItems(events: ParsedEvent[]): NutritionItem[] {
  const items = events
    .filter((event) => event.category === 'nutrition')
    .map((event) => ({
      id: event.id,
      timestamp: toIsoString(getString(event.payload, ['timestamp', 'recordedAt', 'loggedAt']), event.ts),
      mealName: getString(event.payload, ['mealName', 'meal', 'name']) ?? 'Nutrition',
      calories: round(getNumber(event.payload, ['calories', 'caloriesConsumed', 'energyKcal']) ?? 0)
    }));

  return sortByTimestampDesc(items, (item) => item.timestamp);
}

function extractRecoveryItems(events: ParsedEvent[]): RecoveryItem[] {
  const items = events.flatMap((event) => {
    const looksLikeRecovery = event.category === 'sleep' || hasAny(event.payload, [
      'sleepHours',
      'fatigueLevel',
      'stressLevel',
      'recoveryScore'
    ]);
    if (!looksLikeRecovery) return [];

    return [{
      id: event.id,
      timestamp: toIsoString(getString(event.payload, ['timestamp', 'recordedAt', 'loggedAt']), event.ts),
      sleepHours: getNumber(event.payload, ['sleepHours', 'hoursSlept', 'durationHours']) ?? null,
      fatigueLevel: Math.round(getNumber(event.payload, ['fatigueLevel', 'fatigue']) ?? 0),
      stressLevel: Math.round(getNumber(event.payload, ['stressLevel', 'stress']) ?? 0)
    }];
  });

  return sortByTimestampDesc(items, (item) => item.timestamp);
}

function normalizePrType(value: string | undefined): string {
  if (!value) return 'MAX_WEIGHT';
  return value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function extractPrItems(events: ParsedEvent[]): PrItem[] {
  const items = events.flatMap((event) => {
    const exerciseName = getString(event.payload, ['exerciseName', 'exercise']);
    const hasPrSignal = hasAny(event.payload, ['prType', 'personalRecord']) || (exerciseName !== undefined && hasAny(event.payload, ['value', 'unit']));
    if (!hasPrSignal || !exerciseName) return [];

    return [{
      id: event.id,
      exerciseName,
      prType: normalizePrType(getString(event.payload, ['prType', 'type'])),
      value: round(getNumber(event.payload, ['value', 'weightKg', 'reps', 'distanceMeters', 'durationSeconds']) ?? 0),
      unit: getString(event.payload, ['unit']) ?? 'count',
      achievedAt: toIsoString(getString(event.payload, ['achievedAt', 'timestamp', 'recordedAt']), event.ts)
    }];
  });

  return sortByTimestampDesc(items, (item) => item.achievedAt);
}

export async function getBridgeEvents(db: Database, config: AppConfig): Promise<ParsedEvent[]> {
  const rows = await db.all<EventView[]>('SELECT source_event_id, category, ts, payload_json FROM health_events ORDER BY ts DESC');
  return applySensitivityPolicy(rows, config).map((row) => ({
    id: row.source_event_id,
    category: row.category,
    ts: row.ts,
    payload: parsePayload(row.payload_json)
  }));
}

export async function getLastSyncedAt(db: Database): Promise<string> {
  const bundleRow = await db.get<{ last_synced_at: string | null }>('SELECT MAX(ingested_at) AS last_synced_at FROM ingested_bundles');
  if (bundleRow?.last_synced_at) return bundleRow.last_synced_at;

  const eventRow = await db.get<{ last_event_at: string | null }>('SELECT MAX(ts) AS last_event_at FROM health_events');
  return eventRow?.last_event_at ?? new Date().toISOString();
}

export async function buildHealthStatusResponse(db: Database) {
  return {
    schema_version: BRIDGE_SCHEMA_VERSION,
    status: 'ok',
    lastSyncedAt: await getLastSyncedAt(db)
  };
}

export async function buildSnapshotResponse(db: Database, config: AppConfig, date: string) {
  const [events, lastSyncedAt] = await Promise.all([
    getBridgeEvents(db, config),
    getLastSyncedAt(db)
  ]);
  const snapshot = buildSnapshotView(events, date);

  if (!snapshot) {
    return {
      statusCode: 404,
      body: {
        schema_version: BRIDGE_SCHEMA_VERSION,
        error: 'snapshot_not_found'
      }
    };
  }

  return {
    statusCode: 200,
    body: {
      schema_version: BRIDGE_SCHEMA_VERSION,
      lastSyncedAt,
      dataAvailability: snapshot.dataAvailability,
      snapshot: {
        date: snapshot.date,
        weightKg: snapshot.weightKg,
        heightM: snapshot.heightM,
        bmi: snapshot.bmi,
        stepCount: snapshot.stepCount !== null ? Math.round(snapshot.stepCount) : null,
        sleepHours: snapshot.sleepHours,
        caloriesConsumed: snapshot.caloriesConsumed,
        activeCaloriesBurned: snapshot.activeCaloriesBurned,
        totalCaloriesBurned: snapshot.totalCaloriesBurned,
        workoutCount: snapshot.workoutCount,
        proteinGrams: snapshot.proteinGrams,
        carbsGrams: snapshot.carbsGrams,
        fatGrams: snapshot.fatGrams,
        recoveryScore: snapshot.recoveryScore,
        flags: snapshot.flags
      }
    }
  };
}

export async function buildSummaryResponse(db: Database, config: AppConfig, start: string, end: string) {
  const [events, lastSyncedAt] = await Promise.all([
    getBridgeEvents(db, config),
    getLastSyncedAt(db)
  ]);
  const snapshots = dateRange(start, end)
    .map((date) => buildSnapshotView(events, date))
    .filter((snapshot): snapshot is SnapshotView => snapshot !== null);
  const prs = extractPrItems(events).filter((item) => inDateRange(item.achievedAt, start, end));
  const recoveryRiskCount = snapshots.filter((snapshot) => (snapshot.recoveryScore ?? 100) < 50).length;

  return {
    schema_version: BRIDGE_SCHEMA_VERSION,
    lastSyncedAt,
    dataAvailability: {
      avgWeight: snapshots.some((snapshot) => snapshot.weightKg !== null) ? 'MEASURED' : 'UNAVAILABLE',
      avgSleep: snapshots.some((snapshot) => snapshot.sleepHours !== null) ? 'MEASURED' : 'UNAVAILABLE',
      avgSteps: snapshots.some((snapshot) => snapshot.stepCount !== null) ? 'MEASURED' : 'UNAVAILABLE'
    },
    summary: {
      rangeStart: start,
      rangeEnd: end,
      avgWeight: average(snapshots.map((snapshot) => snapshot.weightKg)),
      avgSleep: average(snapshots.map((snapshot) => snapshot.sleepHours)),
      avgSteps: average(snapshots.map((snapshot) => snapshot.stepCount)),
      avgCaloriesConsumed: average(snapshots.map((snapshot) => snapshot.caloriesConsumed)),
      avgCaloriesBurned: average(snapshots.map((snapshot) => snapshot.totalCaloriesBurned)),
      workoutAdherenceRate: snapshots.length === 0
        ? null
        : round((snapshots.filter((snapshot) => snapshot.workoutCount > 0).length / snapshots.length) * 100, 0),
      newPrCount: prs.length,
      recoveryRiskCount
    }
  };
}

export async function buildWorkoutListResponse(db: Database, config: AppConfig, rawLimit: string | undefined) {
  const [events, lastSyncedAt] = await Promise.all([
    getBridgeEvents(db, config),
    getLastSyncedAt(db)
  ]);
  return {
    schema_version: BRIDGE_SCHEMA_VERSION,
    lastSyncedAt,
    items: extractWorkoutItems(events).slice(0, clampLimit(rawLimit))
  };
}

export async function buildNutritionListResponse(db: Database, config: AppConfig, rawLimit: string | undefined) {
  const [events, lastSyncedAt] = await Promise.all([
    getBridgeEvents(db, config),
    getLastSyncedAt(db)
  ]);
  return {
    schema_version: BRIDGE_SCHEMA_VERSION,
    lastSyncedAt,
    items: extractNutritionItems(events).slice(0, clampLimit(rawLimit))
  };
}

export async function buildRecoveryListResponse(db: Database, config: AppConfig, rawLimit: string | undefined) {
  const [events, lastSyncedAt] = await Promise.all([
    getBridgeEvents(db, config),
    getLastSyncedAt(db)
  ]);
  return {
    schema_version: BRIDGE_SCHEMA_VERSION,
    lastSyncedAt,
    items: extractRecoveryItems(events).slice(0, clampLimit(rawLimit))
  };
}

export async function buildPrListResponse(db: Database, config: AppConfig, rawLimit: string | undefined) {
  const [events, lastSyncedAt] = await Promise.all([
    getBridgeEvents(db, config),
    getLastSyncedAt(db)
  ]);
  return {
    schema_version: BRIDGE_SCHEMA_VERSION,
    lastSyncedAt,
    items: extractPrItems(events).slice(0, clampLimit(rawLimit))
  };
}

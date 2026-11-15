import { describe, expect, it } from 'vitest';
import {
  COMMISSION_BASIS,
  COMMISSION_METHOD,
  CUSTOMER_STATUS,
  MEMBER_STATUS,
  PRICING_MODEL,
  ROLES,
  SERVICE_CATEGORY,
  SETTING_IDS,
  STUDIO_STATUS,
} from '../../src/domain/enums/roles.js';
import { DomainValidationError } from '../../src/domain/validators/schemaValidators.js';
import {
  createDefaultSettingsPayloads,
  parseTimeToMinutes,
  requireSafeInt,
  validateBusinessProfile,
  validateCustomer,
  validateOperatingHours,
  validateService,
  validateSettingsDoc,
  validateStudio,
} from '../../src/domain/validators/masterDataValidators.js';
import { calculateServicePrice } from '../../src/domain/calculations/pricingCalculator.js';
import { calculateOperatorCommission } from '../../src/domain/calculations/commissionCalculator.js';
import {
  canArchiveCustomers,
  canManageCustomers,
  canManageMasterData,
  filterAccessibleStudios,
} from '../../src/domain/policies/accessPolicy.js';
import {
  formatIdr,
  formatOperatingHours,
  parseDurationOptionsInput,
} from '../../src/shared/utils/formatters.js';

const BIZ_ID = 'biz-37-test';
const OWNER_UID = 'owner-1';

describe('Phase 02 Master Data Validators & Calculators', () => {
  it('validates integers, HH:mm times, and operating hours boundaries', () => {
    expect(requireSafeInt(150000, 'price')).toBe(150000);
    expect(() => requireSafeInt(150000.5, 'price')).toThrow(DomainValidationError);
    expect(() => requireSafeInt(-1, 'price', { min: 0 })).toThrow(DomainValidationError);

    expect(parseTimeToMinutes('10:00', 'openTime')).toBe(600);
    expect(parseTimeToMinutes('22:00', 'closeTime')).toBe(1320);
    expect(() => parseTimeToMinutes('25:00', 'openTime')).toThrow(DomainValidationError);

    expect(validateOperatingHours({ openTime: '10:00', closeTime: '22:00' })).toEqual({
      openTime: '10:00',
      closeTime: '22:00',
    });
    expect(() => validateOperatingHours({ openTime: '22:00', closeTime: '10:00' })).toThrow(
      DomainValidationError,
    );
    expect(() => validateOperatingHours({ openTime: '10:00', closeTime: '10:00' })).toThrow(
      DomainValidationError,
    );
  });

  it('validates business profile and all 5 default settings docs', () => {
    const profile = validateBusinessProfile({
      businessId: BIZ_ID,
      displayName: '37 Music Studio Jakarta',
      legalName: 'PT 37 Audio Kreasi',
      phone: '081234567890',
      email: 'hello@37musicstudio.id',
      address: 'Jl. Musik No. 37',
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });
    expect(profile.timezone).toBe('Asia/Jakarta');
    expect(profile.currency).toBe('IDR');

    const defaults = createDefaultSettingsPayloads(BIZ_ID, OWNER_UID);
    expect(Object.keys(defaults).sort()).toEqual([
      SETTING_IDS.BOOKING_POLICY,
      SETTING_IDS.BUSINESS,
      SETTING_IDS.COMMISSION,
      SETTING_IDS.PRICING,
      SETTING_IDS.SCHEDULE,
    ]);

    for (const [settingId, payload] of Object.entries(defaults)) {
      const validated = validateSettingsDoc(settingId, payload);
      expect(validated.settingId).toBe(settingId);
      expect(validated.configVersion).toBe(1);
    }

    expect(() => validateSettingsDoc('unknown', defaults.business)).toThrow(DomainValidationError);
    expect(() =>
      validateSettingsDoc(SETTING_IDS.SCHEDULE, {
        ...defaults.schedule,
        slotGranularityMinutes: 45,
      }),
    ).toThrow(DomainValidationError);
    expect(() =>
      validateSettingsDoc(SETTING_IDS.PRICING, {
        ...defaults.pricing,
        taxPercent: 101,
      }),
    ).toThrow(DomainValidationError);
    expect(() =>
      validateSettingsDoc(SETTING_IDS.COMMISSION, {
        ...defaults.commission,
        defaultRatePercent: 120,
      }),
    ).toThrow(DomainValidationError);
  });

  it('validates and normalizes studio docs', () => {
    const studio = validateStudio({
      studioId: 'studio-a',
      businessId: BIZ_ID,
      name: 'Studio A (Main Tracking)',
      code: 'studio-a',
      status: STUDIO_STATUS.ACTIVE,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    expect(studio.code).toBe('STUDIO-A');
    expect(studio.timezone).toBe('Asia/Jakarta');

    expect(() =>
      validateStudio({
        studioId: 'studio-b',
        businessId: BIZ_ID,
        name: 'Studio B',
        code: 'invalid code!',
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);
  });

  it('validates versioned services with integer IDR money & commission bounds', () => {
    const service = validateService({
      serviceId: 'svc-rehearsal',
      businessId: BIZ_ID,
      name: 'Band Rehearsal',
      category: SERVICE_CATEGORY.REHEARSAL,
      pricingModel: PRICING_MODEL.HOURLY,
      durationOptions: [120, 60, 120, 90],
      basePriceMinor: 150000,
      durationPricesMinor: { 120: 280000 },
      commissionMethod: COMMISSION_METHOD.PERCENTAGE,
      commissionValue: 15,
      applicableStudioIds: ['studio-a', 'studio-a'],
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    expect(service.durationOptions).toEqual([60, 90, 120]);
    expect(service.durationPricesMinor).toEqual({ 120: 280000 });
    expect(service.applicableStudioIds).toEqual(['studio-a']);
    expect(service.configVersion).toBe(1);

    expect(() =>
      validateService({
        serviceId: 'svc-bad-money',
        businessId: BIZ_ID,
        name: 'Recording',
        category: SERVICE_CATEGORY.RECORDING,
        pricingModel: PRICING_MODEL.HOURLY,
        durationOptions: [60],
        basePriceMinor: 150000.25,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      validateService({
        serviceId: 'svc-bad-comm',
        businessId: BIZ_ID,
        name: 'Mixing',
        category: SERVICE_CATEGORY.MIXING,
        pricingModel: PRICING_MODEL.FIXED_SESSION,
        durationOptions: [120],
        basePriceMinor: 500000,
        commissionMethod: COMMISSION_METHOD.PERCENTAGE,
        commissionValue: 105,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);
  });

  it('validates customer profiles and normalizes search fields', () => {
    const customer = validateCustomer({
      customerId: 'cust-1',
      businessId: BIZ_ID,
      name: 'Senja Acoustic',
      phone: '0811 999 888',
      email: 'senja@band.id',
      bandOrActName: 'Senja Trio',
      status: CUSTOMER_STATUS.ACTIVE,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    expect(customer.nameLower).toBe('senja acoustic');
    expect(customer.phone).toBe('0811 999 888');

    expect(() =>
      validateCustomer({
        customerId: 'cust-bad',
        businessId: BIZ_ID,
        name: 'Bad Email Band',
        phone: '0812345678',
        email: 'not-an-email',
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);
  });

  it('calculates deterministic IDR service prices for hourly proration, overrides, and packages', () => {
    const hourlyService = validateService({
      serviceId: 'svc-rehearsal',
      businessId: BIZ_ID,
      name: 'Band Rehearsal',
      category: SERVICE_CATEGORY.REHEARSAL,
      pricingModel: PRICING_MODEL.HOURLY,
      durationOptions: [60, 90, 120],
      basePriceMinor: 150000,
      durationPricesMinor: { 120: 275000 },
      configVersion: 3,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    // 90 mins prorated from 150,000/hr -> 225,000 - 25,000 discount + 11% tax = 222,000
    const prorated = calculateServicePrice({
      service: hourlyService,
      durationMinutes: 90,
      discountMinor: 25000,
      taxPercent: 11,
    });
    expect(prorated).toEqual({
      currency: 'IDR',
      serviceId: 'svc-rehearsal',
      serviceName: 'Band Rehearsal',
      configVersion: 3,
      pricingModel: PRICING_MODEL.HOURLY,
      durationMinutes: 90,
      baseSubtotalMinor: 225000,
      discountMinor: 25000,
      netBeforeTaxMinor: 200000,
      taxPercent: 11,
      taxMinor: 22000,
      totalMinor: 222000,
    });
    expect(Object.isFrozen(prorated)).toBe(true);

    // 120 mins uses durationPricesMinor override (275,000 instead of 300,000)
    const overridden = calculateServicePrice({
      service: hourlyService,
      durationMinutes: 120,
    });
    expect(overridden.baseSubtotalMinor).toBe(275000);
    expect(overridden.totalMinor).toBe(275000);

    // Unavailable duration fails cleanly
    expect(() =>
      calculateServicePrice({
        service: hourlyService,
        durationMinutes: 180,
      }),
    ).toThrow(DomainValidationError);

    // Package pricing uses flat basePriceMinor
    const pkgService = validateService({
      serviceId: 'svc-mastering',
      businessId: BIZ_ID,
      name: 'Single Mastering Package',
      category: SERVICE_CATEGORY.MASTERING,
      pricingModel: PRICING_MODEL.PACKAGE,
      durationOptions: [180],
      basePriceMinor: 450000,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });
    expect(
      calculateServicePrice({ service: pkgService, durationMinutes: 180 }).totalMinor,
    ).toBe(450000);
  });

  it('computes operator commissions with service override precedence and basis rules', () => {
    const defaultPctSetting = {
      defaultMethod: COMMISSION_METHOD.PERCENTAGE,
      defaultRatePercent: 10,
      defaultFixedAmountMinor: 0,
      basis: COMMISSION_BASIS.SETTLED_AMOUNT,
    };

    // Inherits 10% on settled amount (200,000) -> 20,000
    const inherited = calculateOperatorCommission({
      service: { commissionMethod: COMMISSION_METHOD.INHERIT, commissionValue: 0 },
      commissionSetting: defaultPctSetting,
      grossAmountMinor: 250000,
      netAmountMinor: 200000,
    });
    expect(inherited).toEqual({
      currency: 'IDR',
      method: COMMISSION_METHOD.PERCENTAGE,
      rateOrValue: 10,
      source: 'business_default',
      basis: COMMISSION_BASIS.SETTLED_AMOUNT,
      basisAmountMinor: 200000,
      amountMinor: 20000,
    });

    // Overrides with fixed per booking (50,000) regardless of subtotal basis
    const fixedOverride = calculateOperatorCommission({
      service: { commissionMethod: COMMISSION_METHOD.FIXED_PER_BOOKING, commissionValue: 50000 },
      commissionSetting: { ...defaultPctSetting, basis: COMMISSION_BASIS.SUBTOTAL },
      grossAmountMinor: 250000,
      netAmountMinor: 200000,
    });
    expect(fixedOverride).toEqual({
      currency: 'IDR',
      method: COMMISSION_METHOD.FIXED_PER_BOOKING,
      rateOrValue: 50000,
      source: 'service_override',
      basis: COMMISSION_BASIS.SUBTOTAL,
      basisAmountMinor: 250000,
      amountMinor: 50000,
    });

    // Explicit none override yields 0
    const noComm = calculateOperatorCommission({
      service: { commissionMethod: COMMISSION_METHOD.NONE, commissionValue: 0 },
      commissionSetting: defaultPctSetting,
      grossAmountMinor: 250000,
      netAmountMinor: 200000,
    });
    expect(noComm.amountMinor).toBe(0);
    expect(noComm.source).toBe('service_override');
  });

  it('enforces Phase 02 master-data/customer permissions and studio scoping helpers', () => {
    const owner = {
      role: ROLES.OWNER,
      status: MEMBER_STATUS.ACTIVE,
      assignedStudioIds: [],
      permissions: {},
    };
    const operatorWithCust = {
      role: ROLES.OPERATOR,
      status: MEMBER_STATUS.ACTIVE,
      assignedStudioIds: ['studio-a'],
      permissions: { canManageCustomers: true },
    };
    const operatorNoCust = {
      role: ROLES.OPERATOR,
      status: MEMBER_STATUS.ACTIVE,
      assignedStudioIds: ['studio-b'],
      permissions: { canManageCustomers: false },
    };

    expect(canManageMasterData(owner)).toBe(true);
    expect(canManageMasterData(operatorWithCust)).toBe(false);

    expect(canManageCustomers(owner)).toBe(true);
    expect(canManageCustomers(operatorWithCust)).toBe(true);
    expect(canManageCustomers(operatorNoCust)).toBe(false);

    expect(canArchiveCustomers(owner)).toBe(true);
    expect(canArchiveCustomers(operatorWithCust)).toBe(false);

    const studios = [
      { studioId: 'studio-a', name: 'Studio A' },
      { studioId: 'studio-b', name: 'Studio B' },
    ];
    expect(filterAccessibleStudios(owner, studios)).toHaveLength(2);
    expect(filterAccessibleStudios(operatorWithCust, studios)).toEqual([
      { studioId: 'studio-a', name: 'Studio A' },
    ]);
    expect(filterAccessibleStudios({ ...operatorWithCust, status: MEMBER_STATUS.SUSPENDED }, studios)).toEqual([]);
  });

  it('formats IDR, operating hours, and parses duration input cleanly', () => {
    expect(formatIdr(150000)).toContain('150.000');
    expect(formatIdr(null)).toBe('Rp 0');
    expect(formatOperatingHours({ openTime: '09:00', closeTime: '23:00' })).toBe('09:00 – 23:00');
    expect(formatOperatingHours(null)).toBe('10:00 – 22:00');
    expect(parseDurationOptionsInput('120, 60, 120, bad, 10, 90, 2000')).toEqual([60, 90, 120]);
  });
});

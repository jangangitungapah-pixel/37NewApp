import {
  CUSTOMER_STATUS,
  MEMBER_STATUS,
  ROLES,
  STUDIO_STATUS,
} from '../../domain/enums/roles.js';
import {
  canArchiveCustomers,
  canManageCustomers,
  canManageMasterData,
} from '../../domain/policies/accessPolicy.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  bootstrapDefaultMasterSettings,
  upsertBusinessProfile,
  upsertBusinessSetting,
} from '../../data/repositories/businessProfileRepository.js';
import { saveStudioDoc } from '../../data/repositories/studioRepository.js';
import { saveServiceDoc, seedStarterServices } from '../../data/repositories/serviceRepository.js';
import { fetchCustomersPage, saveCustomerDoc } from '../../data/repositories/customerRepository.js';
import { upsertBusinessMemberDoc } from '../../data/repositories/teamRepository.js';

function assertOnline(isOnline) {
  if (isOnline === false) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'network/offline-write-blocked',
      message:
        'Perubahan master data ditahan saat offline. Sambungkan internet agar konfigurasi & hak akses tersinkron ke Firestore.',
      retryable: true,
    });
  }
}

function assertOwnerAuthority(member, actionLabel) {
  if (!canManageMasterData(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/owner-required',
      message: `Hanya Owner aktif yang berhak ${actionLabel}.`,
    });
  }
}

export async function initializeDefaultMasterDataUseCase({
  member,
  business,
  existingProfile = null,
  existingSettingsMap = {},
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'menginisialisasi master data default');
  return bootstrapDefaultMasterSettings({
    businessId: member.businessId,
    businessName: business?.name || '37 Music Studio',
    actorUid: member.uid,
    existingProfile,
    existingSettingsMap,
  });
}

export async function saveBusinessProfileUseCase({
  member,
  data,
  existingProfile = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengubah profil bisnis');
  return upsertBusinessProfile({
    businessId: member.businessId,
    actorUid: member.uid,
    data,
    existingProfile,
  });
}

export async function saveBusinessSettingUseCase({
  member,
  settingId,
  data,
  existingSetting = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengubah pengaturan bisnis');
  return upsertBusinessSetting({
    businessId: member.businessId,
    settingId,
    actorUid: member.uid,
    data,
    existingSetting,
  });
}

export async function saveStudioUseCase({
  member,
  data,
  existingStudio = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengelola studio dan jam operasional');
  return saveStudioDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data,
    existingStudio,
  });
}

export async function toggleStudioStatusUseCase({
  member,
  studio,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengubah status studio');
  const nextStatus =
    studio.status === STUDIO_STATUS.ACTIVE ? STUDIO_STATUS.INACTIVE : STUDIO_STATUS.ACTIVE;
  return saveStudioDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data: { ...studio, status: nextStatus },
    existingStudio: studio,
  });
}

export async function saveServiceUseCase({
  member,
  data,
  existingService = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengelola layanan dan tarif');
  return saveServiceDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data,
    existingService,
  });
}

export async function seedStarterServicesUseCase({
  member,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'membuat daftar layanan awal');
  return seedStarterServices({
    businessId: member.businessId,
    actorUid: member.uid,
  });
}

export async function toggleServiceActiveUseCase({
  member,
  service,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengubah status layanan');
  return saveServiceDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data: { ...service, active: !service.active },
    existingService: service,
  });
}

export async function listCustomersPageUseCase({
  member,
  status = CUSTOMER_STATUS.ACTIVE,
  pageSize = 20,
  cursorDoc = null,
  searchPrefix = '',
}) {
  if (!canManageCustomers(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/customer-read-denied',
      message: 'Anda tidak memiliki izin mengakses daftar customer bisnis ini.',
    });
  }
  return fetchCustomersPage({
    businessId: member.businessId,
    status,
    pageSize,
    cursorDoc,
    searchPrefix,
  });
}

export async function saveCustomerUseCase({
  member,
  data,
  existingCustomer = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  if (!canManageCustomers(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/customer-write-denied',
      message: 'Anda tidak memiliki izin menyimpan data customer.',
    });
  }
  if (!canArchiveCustomers(member) && data.status === CUSTOMER_STATUS.ARCHIVED) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/customer-archive-owner-only',
      message: 'Hanya Owner yang dapat mengarsipkan data customer.',
    });
  }
  return saveCustomerDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data: {
      ...data,
      status: existingCustomer?.status || data.status || CUSTOMER_STATUS.ACTIVE,
    },
    existingCustomer,
  });
}

export async function setCustomerArchiveStatusUseCase({
  member,
  customer,
  archived,
  isOnline = true,
}) {
  assertOnline(isOnline);
  if (!canArchiveCustomers(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/customer-archive-owner-only',
      message: 'Hanya Owner yang dapat mengarsipkan atau mengaktifkan kembali customer.',
    });
  }
  return saveCustomerDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data: {
      ...customer,
      status: archived ? CUSTOMER_STATUS.ARCHIVED : CUSTOMER_STATUS.ACTIVE,
    },
    existingCustomer: customer,
  });
}

export async function saveTeamMemberUseCase({
  member,
  data,
  existingTargetMember = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertOwnerAuthority(member, 'mengelola keanggotaan tim dan penugasan studio');

  const targetUid = (data.uid || '').trim();
  if (!targetUid) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/uid-required',
      message: 'Firebase Auth UID anggota wajib diisi.',
    });
  }

  if (
    targetUid === member.uid &&
    (data.role !== ROLES.OWNER || data.status !== MEMBER_STATUS.ACTIVE)
  ) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/self-demotion-blocked',
      message: 'Owner aktif tidak dapat menurunkan role atau menonaktifkan dirinya sendiri.',
    });
  }

  return upsertBusinessMemberDoc({
    businessId: member.businessId,
    actorUid: member.uid,
    data,
    existingMember: existingTargetMember,
  });
}

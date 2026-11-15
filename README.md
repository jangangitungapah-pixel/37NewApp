# 37MusicStudio

Rebuild modular aplikasi manajemen studio musik **37MusicStudio** dari nol dengan **Owner Portal** dan **Operator Portal** dalam satu aplikasi web yang berbagi domain model, use cases, repository contracts, Firebase client, dan Firestore Security Rules.

## Hard Constraints
- **Frontend**: React + Vite + JavaScript (JSX), struktur modular berbasis fitur (`src/`).
- **Identity & Database**: Firebase Authentication + Cloud Firestore (satu-satunya database operasional).
- **Hosting**: Firebase Hosting (statis, tanpa server-side business logic).
- **Media Gallery**: Cloudinary dengan restricted unsigned upload preset (hanya file gambar & CDN delivery; metadata disimpan di Firestore).
- **Infrastruktur**: Firebase **Spark plan only** (tanpa Blaze, Cloud Billing, Cloud Functions, Firebase Storage, Cloud Run, Cloudflare Workers, backend berbayar, atau database kedua).
- **Firebase Target**: Menggunakan **project Firebase baru** (project eksisting pada akun tidak dipakai dan tidak disentuh).

## Dokumentasi & Checkpoint Fase

| Fase | Judul | Status | Dokumen Checkpoint & Handoff |
| :--- | :--- | :--- | :--- |
| **00** | Discovery, Repository Audit & Architecture Lock | Selesai | [Checkpoint Phase 00](docs/checkpoints/phase-00-checkpoint.md) · [Handoff Phase 01](docs/handoffs/phase-01-handoff-prompt.txt) |
| **01** | Application Foundation & Firebase Security | Selesai | [Checkpoint Phase 01](docs/checkpoints/phase-01-checkpoint.md) · [Handoff Phase 02](docs/handoffs/phase-02-handoff-prompt.txt) |
| **02** | Business Master Data | Menunggu Eksekusi | — |
| **03** | Booking Engine & Calendar | Belum Dimulai | — |
| **04** | Session, Settlement, Ledger & Commission | Belum Dimulai | — |
| **05** | Portal Collaboration & Notifications | Belum Dimulai | — |
| **06** | Gallery & Cloudinary | Belum Dimulai | — |
| **07** | Dashboard, Analytics & Reporting | Belum Dimulai | — |
| **08** | Hardening, Accessibility & Production Readiness | Belum Dimulai | — |

## Dokumen Arsitektur Phase 00
- [Audit Discovery Awal (Phase 00)](docs/audit/phase-00-discovery-audit.md)
- [Architecture Decision Record 0001 — Architecture Lock](docs/adr/0001-architecture-lock.md)
- [Rebuild Plan, Scope & Risk Register](docs/architecture/rebuild-plan-and-risks.md)

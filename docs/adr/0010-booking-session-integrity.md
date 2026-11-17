# ADR-0010: Booking and Session Integrity — Phase 10

- **Status:** Accepted for Phase 10 implementation
- **Date:** 2026-11-17
- **Repository:** `jangangitungapah-pixel/37NewApp`
- **Base:** `main` at `07865862ca8f47cb9db8a329da390f7b498852be`
- **Implementation branch:** `feature/phase-10-booking-session-lifecycle`

## 1. Accepted architecture decision

The product owner explicitly selected **Option A — Firebase Spark-only** and explicitly accepted the residual risk that an authorized Owner/Operator can craft direct Firestore writes outside the official application repository.

The application backend remains:
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Firebase Spark plan

This phase must not add Cloud Functions, Cloud Run, Cloudflare Workers, another request-path backend, Firebase Storage, Firebase Extensions, Blaze, Cloud Billing, or a payment method.

## 2. Security threat model and residual risk

The official booking flows continue to use deterministic 15-minute slot documents and Firestore transactions. Those transactions serialize normal repository operations that contend on the same slot documents.

Firestore Rules will be hardened with exact, feasible companion-document checks and adversarial emulator tests. Rules cannot iterate over an arbitrary `slotIds` array of up to 96 paths, and the document access-call budgets prevent proving every possible slot companion in a single request.

**Accepted residual risk:** an authorized member who has permission to manage bookings may bypass the official repository and issue direct Firestore writes that do not preserve the complete booking-to-slot invariant. The application is therefore **not server-authoritative, not fully tamper-proof, and not guaranteed to prevent malicious direct writes by an otherwise authorized member**.

This is an accepted Spark-only threat model, not a claim that the residual risk has been eliminated. A future requirement for server-authoritative integrity requires a separate architecture revision and explicit cost/billing approval.

## 3. Booking and session state separation

Booking status remains responsible for request/decision and finance lifecycle. Session status is a separate operational state machine.

Booking statuses retain existing finance states and add `REJECTED` for a rejected pending request. Legacy `IN_PROGRESS` remains readable for old documents and is not emitted by new session-start operations.

Session statuses:
- `PENDING`
- `UPCOMING`
- `IN_PROGRESS`
- `COMPLETED`
- `NO_SHOW`
- `CANCELLED`

Compatibility reads derive the session state when `sessionStatus` is absent. They must not fabricate actual start/end timestamps or elapsed duration.

## 4. Operational contract adopted for Phase 10

- Check-in records check-in time and actor but does not start the session.
- Start is a separate action and records actual start time and actor.
- Complete requires an in-progress session with a valid actual start, records actual end/duration, and atomically advances booking to `COMPLETED_PENDING_SETTLEMENT`.
- No-show is allowed only from an upcoming, not-checked-in session, at least 15 minutes after scheduled start, and requires a reason of at least four trimmed characters.
- Rejection is available only for `PENDING_CONFIRMATION`, records a reason, and releases the booking's owned slot locks.
- Existing NewApp behavior allowing cancellation from its legacy `IN_PROGRESS` booking state is preserved for backward compatibility. New session-aware cancellation must retain the recorded actual start and record the terminal cancellation explicitly; it must not fabricate an actual end time.
- Completion and finance settlement do not release slot locks early. Existing reservation semantics are preserved; cancellation, rejection, and no-show release owned locks.
- Booking price and commission snapshots remain unchanged during session actions. Phase 10 does not create or settle ledger/commission entries.

## 5. Idempotency contract

Create, decision, reschedule, and session actions use one request ID per user intent, generated before entering the Firestore transaction and reused for retries. Each operation binds the authenticated actor, business scope, action, and canonical payload hash to a deterministic operation marker.

A same-actor/same-action/same-payload replay returns the recorded operation result without duplicating a booking, slot changes, counters, or events. Reusing a request ID with a different actor, scope, action, or payload is rejected as an idempotency conflict. Marker existence never grants authorization.

Notifications remain post-commit and best-effort; transaction callbacks perform no network work or other external side effects.

## 6. Scope and exclusions

Phase 10 is limited to the booking calendar, create/detail booking surfaces, booking/session domain contracts, use cases, repositories, Firestore Rules, focused tests, and relevant documentation. It does not include unrelated portal redesign, dependency stack changes, production data migration/backfill, deployment, Hosting publish, or production writes.

No pull request merge is authorized by this ADR. The user must explicitly approve any merge or deployment.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatUserHeaderName, resolveUserNameParts } from "../lib/user-display-name";

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function tierLabel(tier: "free" | "premium"): string {
  return tier === "premium" ? "Premium" : "חינם";
}

function roleLabel(role: "admin" | "user"): string {
  return role === "admin" ? "מנהל" : "משתמש";
}

type AdminUserSummary = {
  userId: Id<"users">;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phoneVerified: boolean;
  legacyId: string | null;
  createdAt: number | null;
  tier: "free" | "premium";
  role: "admin" | "user";
  allocatedAudioSeconds: number;
  usedAudioSeconds: number;
};

type AdminUsersListResult = {
  users: AdminUserSummary[];
  total: number;
};

type AdminAuditLog = {
  id: string;
  action: string;
  actorEmail: string | null;
  actorUserId: string;
  targetEmail: string | null;
  createdAt: number;
};

function formatPhoneDisplay(phone: string | null): string {
  if (!phone) return "—";
  if (phone.startsWith("+972") && phone.length === 13) {
    return `0${phone.slice(4, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

function userDisplayLabel(user: AdminUserSummary): string {
  const parts = resolveUserNameParts({
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
  });
  if (parts) {
    const fullName = formatUserHeaderName(parts);
    if (fullName) return fullName;
  }
  return user.email || user.legacyId || user.userId;
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-2.5 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-900" dir={label === "אימייל" || label === "טלפון" ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "user.setTier": "שינוי מנוי",
  "user.setRole": "שינוי הרשאה",
  "user.resetQuotas": "איפוס מכסות",
  "user.restoreLegacyData": "שחזור נתונים",
};

export function AdminUsersPanel() {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreLegacyId, setRestoreLegacyId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery(api.adminUsers.list, {
    search: search.trim() || undefined,
  }) as AdminUsersListResult | undefined;
  const details = useQuery(
    api.adminUsers.getDetails,
    selectedUserId ? { userId: selectedUserId } : "skip",
  );
  const auditLogs = useQuery(api.adminUsers.listAuditLogs, {
    limit: 20,
  }) as AdminAuditLog[] | undefined;

  const setTier = useMutation(api.adminUsers.setTier);
  const setRole = useMutation(api.adminUsers.setRole);
  const resetQuotas = useMutation(api.adminUsers.resetQuotas);
  const restoreLegacyData = useMutation(api.adminUsers.restoreLegacyData);

  const selectedSummary = useMemo(
    () => list?.users.find((user) => user.userId === selectedUserId) ?? null,
    [list?.users, selectedUserId],
  );

  async function runAction(
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  if (list === undefined) {
    return <p className="text-sm text-slate-500">טוען משתמשים...</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600">
        ניהול משתמשים, מנויים והרשאות. כל שינוי נרשם ביומן הפעולות.
      </p>

      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">{message}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          חיפוש לפי שם / אימייל / טלפון
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ישראל ישראלי / you@example.com / 050"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          dir="ltr"
        />
      </label>

      <div className="rounded-lg border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          {list.total} משתמשים
        </div>
        <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
          {list.users.length === 0 ? (
            <li className="px-3 py-4 text-center text-slate-500">לא נמצאו משתמשים</li>
          ) : (
            list.users.map((user) => {
              const active = user.userId === selectedUserId;
              return (
                <li key={user.userId}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserId(user.userId);
                      setRestoreEmail(user.email ?? "");
                      setMessage(null);
                      setError(null);
                    }}
                    className={`w-full px-3 py-2.5 text-right transition ${
                      active ? "bg-indigo-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-right">
                        <p className="truncate font-medium text-slate-900">
                          {userDisplayLabel(user)}
                        </p>
                        {user.email ? (
                          <p className="truncate text-xs text-slate-500" dir="ltr">
                            {user.email}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {tierLabel(user.tier)} · {roleLabel(user.role)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {selectedUserId && selectedSummary ? (
        <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div>
            <p className="font-semibold text-slate-900">פרטי משתמש</p>
            <p className="mt-1 text-base font-medium text-slate-800">
              {userDisplayLabel(selectedSummary)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <ProfileField
              label="שם פרטי"
              value={selectedSummary.firstName?.trim() || "—"}
            />
            <ProfileField
              label="שם משפחה"
              value={selectedSummary.lastName?.trim() || "—"}
            />
            <ProfileField
              label="אימייל"
              value={selectedSummary.email ?? "—"}
            />
            <ProfileField
              label="טלפון"
              value={formatPhoneDisplay(selectedSummary.phone)}
            />
            <ProfileField label="מנוי" value={tierLabel(selectedSummary.tier)} />
            <ProfileField label="הרשאה" value={roleLabel(selectedSummary.role)} />
            <ProfileField
              label="אימות טלפון"
              value={selectedSummary.phoneVerified ? "מאומת" : "לא מאומת"}
            />
            <ProfileField
              label="תאריך הרשמה"
              value={formatDate(selectedSummary.createdAt)}
            />
          </div>

          {selectedSummary.legacyId ? (
            <p className="text-xs text-slate-500" dir="ltr">
              legacyId: {selectedSummary.legacyId}
            </p>
          ) : null}

          {details ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-white px-2 py-1.5">משימות: {details.stats.tasks}</div>
              <div className="rounded-md bg-white px-2 py-1.5">
                פעילות: {details.stats.activeTasks}
              </div>
              <div className="rounded-md bg-white px-2 py-1.5">
                מחברות: {details.stats.notebooks}
              </div>
              <div className="rounded-md bg-white px-2 py-1.5">
                רשימות: {details.stats.taskLists}
              </div>
            </div>
          ) : null}

          <div className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">
            אודיו: {selectedSummary.usedAudioSeconds}s /{" "}
            {selectedSummary.allocatedAudioSeconds}s
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void runAction(
                  "tier",
                  () =>
                    setTier({
                      userId: selectedUserId,
                      tier: selectedSummary.tier === "premium" ? "free" : "premium",
                    }),
                  selectedSummary.tier === "premium"
                    ? "המשתמש הועבר לחינם"
                    : "המשתמש קיבל Premium",
                )
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "tier"
                ? "..."
                : selectedSummary.tier === "premium"
                  ? "הורד ל-Free"
                  : "שדרג ל-Premium"}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void runAction(
                  "role",
                  () =>
                    setRole({
                      userId: selectedUserId,
                      role: selectedSummary.role === "admin" ? "user" : "admin",
                    }),
                  selectedSummary.role === "admin"
                    ? "הוסרה הרשאת מנהל"
                    : "נוספה הרשאת מנהל",
                )
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "role"
                ? "..."
                : selectedSummary.role === "admin"
                  ? "הסר מנהל"
                  : "הפוך למנהל"}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void runAction(
                  "quotas",
                  () => resetQuotas({ userId: selectedUserId }),
                  "מכסות האודיו אופסו",
                )
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "quotas" ? "..." : "איפוס מכסות"}
            </button>
          </div>

          <details className="rounded-md border border-slate-200 bg-white p-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">
              שחזור נתונים מחשבון legacy
            </summary>
            <div className="mt-2 space-y-2">
              <input
                type="email"
                value={restoreEmail}
                onChange={(e) => setRestoreEmail(e.target.value)}
                placeholder="אימייל יעד"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                dir="ltr"
              />
              <input
                type="text"
                value={restoreLegacyId}
                onChange={(e) => setRestoreLegacyId(e.target.value)}
                placeholder="source legacyId (אופציונלי)"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                dir="ltr"
              />
              <button
                type="button"
                disabled={busy !== null || !restoreEmail.trim()}
                onClick={() =>
                  void runAction(
                    "restore",
                    () =>
                      restoreLegacyData({
                        email: restoreEmail.trim(),
                        sourceLegacyId: restoreLegacyId.trim() || undefined,
                        grantPremium: false,
                        grantAdmin: false,
                      }),
                    "נתוני legacy שוחזרו למשתמש",
                  )
                }
                className="w-full rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy === "restore" ? "משחזר..." : "שחזר נתונים"}
              </button>
            </div>
          </details>
        </div>
      ) : (
        <p className="text-xs text-slate-500">בחר משתמש מהרשימה לניהול.</p>
      )}

      <div className="rounded-lg border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          יומן פעולות אחרונות
        </div>
        <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto text-xs">
          {auditLogs === undefined ? (
            <li className="px-3 py-3 text-slate-500">טוען...</li>
          ) : auditLogs.length === 0 ? (
            <li className="px-3 py-3 text-slate-500">אין פעולות עדיין</li>
          ) : (
            auditLogs.map((log) => (
              <li key={log.id} className="px-3 py-2">
                <p className="font-medium text-slate-800">
                  {ACTION_LABELS[log.action] ?? log.action}
                </p>
                <p className="text-slate-600">
                  {log.actorEmail ?? log.actorUserId}
                  {log.targetEmail ? ` → ${log.targetEmail}` : ""}
                </p>
                <p className="text-slate-400">{formatDate(log.createdAt)}</p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

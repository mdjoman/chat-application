import {
  useEffect,
  useMemo,
  useState,
} from 'preact/hooks';

import type {
  ApiClient,
} from '../services/api-client';

import type {
  WidgetStoreState,
} from '../state/store';

import type {
  UserProfile,
} from '../types';

export interface ProfileProps {
  api: ApiClient;
  state: WidgetStoreState;
  userId?: number | null;
  onBack: () => void;
}

function displayName(
  profile: UserProfile,
): string {
  return (
    profile.displayName?.trim() ||
    profile.username?.trim() ||
    profile.email?.trim() ||
    `User ${profile.id}`
  );
}

function initials(
  value: string,
): string {
  const parts =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  const first =
    parts[0]?.[0] ??
    '';

  const second =
    parts.length > 1
      ? parts[
          parts.length - 1
        ]?.[0] ?? ''
      : '';

  return (
    first +
    second
  ).toUpperCase();
}

export function Profile({
  api,
  state,
  userId,
  onBack,
}: ProfileProps) {
  const ownUserId =
    state.currentUser?.id ??
    null;

  const targetUserId =
    userId ??
    ownUserId;

  const isOwnProfile =
    targetUserId !== null &&
    targetUserId ===
      ownUserId;

  const [
    profile,
    setProfile,
  ] =
    useState<UserProfile | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    editing,
    setEditing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    form,
    setForm,
  ] =
    useState({
      displayName: '',
      phone: '',
      avatarUrl: '',
    });

  useEffect(
    () => {
      let cancelled =
        false;

      const load =
        async () => {
          if (!targetUserId) {
            setLoading(
              false,
            );

            setError(
              'User is not available.',
            );

            return;
          }

          setLoading(true);
          setError(null);

          try {
            const result =
              isOwnProfile
                ? await api.getMyProfile()
                : await api.getUserProfile(
                    targetUserId,
                  );

            if (cancelled) {
              return;
            }

            setProfile(
              result,
            );

            setForm({
              displayName:
                result.displayName ??
                '',
              phone:
                result.phone ??
                '',
              avatarUrl:
                result.avatarUrl ??
                '',
            });
          } catch (err) {
            if (!cancelled) {
              setError(
                err instanceof Error
                  ? err.message
                  : 'Unable to load profile.',
              );
            }
          } finally {
            if (!cancelled) {
              setLoading(
                false,
              );
            }
          }
        };

      void load();

      return () => {
        cancelled =
          true;
      };
    },
    [
      api,
      targetUserId,
      isOwnProfile,
    ],
  );

  const name =
    useMemo(
      () =>
        profile
          ? displayName(
              profile,
            )
          : '',
      [profile],
    );

  const save =
    async () => {
      if (
        !isOwnProfile ||
        !profile ||
        saving
      ) {
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const updated =
          await api.updateMyProfile(
            {
              displayName:
                form.displayName
                  .trim(),
              phone:
                form.phone.trim() ||
                null,
              avatarUrl:
                form.avatarUrl
                  .trim() ||
                null,
            },
          );

        setProfile(
          updated,
        );

        setEditing(
          false,
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to save profile.',
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  return (
    <section className="cw-page cw-profile">
      <header className="cw-page-header">
        <button
          type="button"
          className="cw-icon-button"
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>

        <strong>
          Profile
        </strong>

        {isOwnProfile &&
        profile ? (
          <button
            type="button"
            className="cw-icon-button"
            onClick={() =>
              setEditing(
                (value) =>
                  !value,
              )
            }
            aria-label="Edit profile"
          >
            {editing
              ? '×'
              : '✎'}
          </button>
        ) : (
          <span />
        )}
      </header>

      {loading ? (
        <div className="cw-state">
          Loading profile…
        </div>
      ) : error &&
        !profile ? (
        <div className="cw-state cw-error">
          {error}
        </div>
      ) : profile ? (
        <div className="cw-profile-content">
          <div className="cw-profile-avatar">
            {profile.avatarUrl ? (
              <img
                src={
                  profile.avatarUrl
                }
                alt={name}
              />
            ) : (
              <span>
                {initials(
                  name,
                )}
              </span>
            )}
          </div>

          <h2>{name}</h2>

          {profile.status ? (
            <p className="cw-muted">
              {profile.status}
            </p>
          ) : null}

          {error ? (
            <div className="cw-error">
              {error}
            </div>
          ) : null}

          {editing &&
          isOwnProfile ? (
            <div className="cw-form">
              <label>
                Display name
                <input
                  value={
                    form.displayName
                  }
                  onInput={(
                    event,
                  ) =>
                    setForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        displayName:
                          event
                            .currentTarget
                            .value,
                      }),
                    )
                  }
                />
              </label>

              <label>
                Phone
                <input
                  value={
                    form.phone
                  }
                  onInput={(
                    event,
                  ) =>
                    setForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        phone:
                          event
                            .currentTarget
                            .value,
                      }),
                    )
                  }
                />
              </label>

              <label>
                Avatar URL
                <input
                  value={
                    form.avatarUrl
                  }
                  onInput={(
                    event,
                  ) =>
                    setForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        avatarUrl:
                          event
                            .currentTarget
                            .value,
                      }),
                    )
                  }
                />
              </label>

              <button
                type="button"
                className="cw-primary-button"
                disabled={
                  saving
                }
                onClick={() =>
                  void save()
                }
              >
                {saving
                  ? 'Saving…'
                  : 'Save'}
              </button>
            </div>
          ) : (
            <div className="cw-profile-details">
              <div>
                <small>
                  Username
                </small>
                <p>
                  {profile.username ||
                    '—'}
                </p>
              </div>

              <div>
                <small>
                  Email
                </small>
                <p>
                  {profile.email ||
                    '—'}
                </p>
              </div>

              <div>
                <small>
                  Phone
                </small>
                <p>
                  {profile.phone ||
                    '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default Profile;

import React, { useCallback, useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import PushScreen from "@/components/PushScreen";
import { PkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/Form";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SectionLabel } from "@/components/ui/Section";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useAuth } from "@/context/AuthContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { resizeAvatarImage } from "@/utils/avatar";
import { AvatarConfirmSheetBody } from "./AvatarConfirmSheet";
import PasswordChangeDrawer from "./PasswordChangeDrawer";
import { type StatusEditInput, StatusEditSheetBody } from "./StatusEditSheet";
import { isNetworkError } from "@/lib/errors";
import { getSaveErrorMessage } from "./saveFailure";

export interface SettingsDrawerProps {
  isOpen: boolean;
  tabKey: TabKey;
  onClose: () => void;
}

const DEPTH_ID = "global-settings";
const AVATAR_DEPTH_ID = "global-settings-avatar";
const STATUS_DEPTH_ID = "global-settings-status";

const SettingsGroup: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <section className="flex flex-col gap-1.5">
    <SectionLabel>{label}</SectionLabel>
    <Card>{children}</Card>
  </section>
);

/** 전역 설정: 프로필·계정·앱 그룹과 로그아웃 */
export default function SettingsDrawer({
  isOpen,
  tabKey,
  onClose,
}: SettingsDrawerProps): React.ReactElement {
  const { player, updateProfile, uploadAvatar, logout } = useAuth();
  const { showSaveFailure } = useSystemNotice();
  const {
    appVersion,
    isUpdateAvailable,
    isCheckingForUpdate,
    isApplyingUpdate,
    checkForUpdate,
    applyUpdate,
  } = useAppUpdate();
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const isActive = tabKey === selectedTab;

  const [isPasswordRequested, setIsPasswordRequested] = useState(false);
  const [isAvatarRequested, setIsAvatarRequested] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [isStatusRequested, setIsStatusRequested] = useState(false);
  // 열 때마다 올려서 상태메시지 입력을 저장값으로 되돌린다
  const [statusSheetKey, setStatusSheetKey] = useState(0);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });
  const closePassword = useCallback(() => setIsPasswordRequested(false), []);
  const closeAvatar = useCallback(() => setIsAvatarRequested(false), []);
  const isAvatarOpen = useLayerDepth({
    isOpen: isAvatarRequested && isOpen,
    tabKey,
    depthId: AVATAR_DEPTH_ID,
    kind: "bottom-sheet",
    onClose: closeAvatar,
  });
  const closeStatus = useCallback(() => setIsStatusRequested(false), []);
  const isStatusOpen = useLayerDepth({
    isOpen: isStatusRequested && isOpen,
    tabKey,
    depthId: STATUS_DEPTH_ID,
    kind: "bottom-sheet",
    onClose: closeStatus,
  });

  // 설정을 닫으면 하위 화면·시트도 닫힌 상태로 돌려 다시 열 때 함께 열리지 않게 한다
  useEffect(() => {
    if (isOpen) return;
    setIsPasswordRequested(false);
    setIsAvatarRequested(false);
    setIsStatusRequested(false);
  }, [isOpen]);

  const closeLayer = (depthId: string, fallback: () => void) => {
    if (!closeDepth(tabKey, depthId)) fallback();
  };

  const handleAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarError(null);
    setAvatarPreviewUrl(null);
    setIsAvatarRequested(true);
    try {
      setAvatarPreviewUrl(await resizeAvatarImage(file));
    } catch (error) {
      setAvatarPreviewUrl(null);
      setAvatarError(getSaveErrorMessage(error, "사진을 읽지 못했습니다."));
    }
  };

  const confirmAvatar = async () => {
    const dataUrl = avatarPreviewUrl;
    if (!dataUrl || isAvatarSaving) return;

    setAvatarError(null);
    setIsAvatarSaving(true);
    try {
      await uploadAvatar(dataUrl);
      closeLayer(AVATAR_DEPTH_ID, closeAvatar);
    } catch (error) {
      if (isNetworkError(error)) {
        // 다시 시도는 저장 실패 알림이 맡는다
        showSaveFailure({
          onRetry: async () => {
            await uploadAvatar(dataUrl);
          },
        });
        closeLayer(AVATAR_DEPTH_ID, closeAvatar);
      } else {
        setAvatarError(
          getSaveErrorMessage(error, "프로필 사진을 바꾸지 못했어요"),
        );
      }
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const openStatus = () => {
    setStatusError(null);
    setStatusSheetKey((key) => key + 1);
    setIsStatusRequested(true);
  };

  const saveStatus = async (input: StatusEditInput) => {
    if (isStatusSaving) return;

    setStatusError(null);
    setIsStatusSaving(true);
    try {
      await updateProfile(input);
      closeLayer(STATUS_DEPTH_ID, closeStatus);
    } catch (error) {
      if (isNetworkError(error)) {
        showSaveFailure({
          onRetry: async () => {
            await updateProfile(input);
          },
        });
        closeLayer(STATUS_DEPTH_ID, closeStatus);
      } else {
        setStatusError(
          getSaveErrorMessage(error, "상태메시지를 저장하지 못했습니다."),
        );
      }
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handleUpdateAction = async () => {
    setUpdateError(null);
    try {
      if (isUpdateAvailable) {
        await applyUpdate();
      } else {
        await checkForUpdate();
      }
    } catch (error) {
      setUpdateError(
        getSaveErrorMessage(error, "업데이트 처리에 실패했습니다."),
      );
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const username = player?.username ?? "";

  return (
    <>
      <PushScreen
        isOpen={isLayerOpen}
        isActive={isActive}
        ariaLabel="설정"
        title="설정"
        onBack={() => closeLayer(DEPTH_ID, onClose)}
        onExited={() => restoreScrollTop(tabKey)}
      >
        <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
          <SettingsGroup label="프로필">
            <ListRow
              label="프로필 사진"
              value={
                player ? (
                  <PlayerAvatar
                    player={{
                      id: player.id,
                      username,
                      avatarUrl: player.avatarUrl,
                    }}
                    size={32}
                    className="align-middle"
                  />
                ) : undefined
              }
              onPress={() => avatarInputRef.current?.click()}
            />
            <ListRow
              label="상태메시지"
              value={
                <span className="block max-w-[50vw] truncate">
                  {player?.statusMessage ?? ""}
                </span>
              }
              onPress={player ? openStatus : undefined}
              showChevron
            />
          </SettingsGroup>

          <SettingsGroup label="계정">
            <ListRow label="로그인 아이디" value={username || "-"} />
            <ListRow
              label="비밀번호 변경"
              onPress={() => setIsPasswordRequested(true)}
            />
          </SettingsGroup>

          <SettingsGroup label="앱">
            <div className="flex min-h-[52px] items-center gap-3">
              <span className="shrink-0 text-pk-15 font-medium text-pk-ink">
                앱 버전
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-pk-13 tabular-nums text-pk-muted">
                {appVersion} ·{" "}
                {isUpdateAvailable ? (
                  <span className="font-bold text-pk-primary">새 버전</span>
                ) : (
                  "최신"
                )}
              </span>
              <PkButton
                variant="outline"
                size="sm"
                disabled={isCheckingForUpdate || isApplyingUpdate}
                onClick={() => void handleUpdateAction()}
              >
                {isApplyingUpdate
                  ? "업데이트 중..."
                  : isCheckingForUpdate
                    ? "확인 중..."
                    : isUpdateAvailable
                      ? "업데이트"
                      : "업데이트 확인"}
              </PkButton>
            </div>
            {updateError ? (
              <p role="alert" className="pb-3 text-pk-13 font-bold text-pk-down">
                {updateError}
              </p>
            ) : null}
          </SettingsGroup>

          <Card>
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              className="flex min-h-[52px] w-full items-center justify-center text-pk-15 font-bold text-pk-sub disabled:opacity-60"
            >
              로그아웃
            </button>
          </Card>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          onChange={(event) => void handleAvatarFileChange(event)}
          className="hidden"
        />
      </PushScreen>

      <PasswordChangeDrawer
        isOpen={isPasswordRequested && isOpen}
        tabKey={tabKey}
        onClose={closePassword}
      />

      <BottomSheet
        isOpen={isAvatarOpen}
        isActive={isActive}
        onOpenChange={(nextIsOpen) => {
          if (!nextIsOpen && !isAvatarSaving) {
            closeLayer(AVATAR_DEPTH_ID, closeAvatar);
          }
        }}
        ariaLabel="프로필 사진"
        layer={GLOBAL_LAYER.sheet}
        isFixedHeight={false}
      >
        <AvatarConfirmSheetBody
          previewUrl={avatarPreviewUrl}
          error={avatarError}
          isSaving={isAvatarSaving}
          onPickAgain={() => avatarInputRef.current?.click()}
          onConfirm={() => void confirmAvatar()}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={isStatusOpen}
        isActive={isActive}
        onOpenChange={(nextIsOpen) => {
          if (!nextIsOpen && !isStatusSaving) {
            closeLayer(STATUS_DEPTH_ID, closeStatus);
          }
        }}
        ariaLabel="상태메시지"
        layer={GLOBAL_LAYER.sheet}
        isFixedHeight={false}
      >
        {player ? (
          <StatusEditSheetBody
            key={statusSheetKey}
            player={player}
            isSaving={isStatusSaving}
            error={statusError}
            onCancel={() => closeLayer(STATUS_DEPTH_ID, closeStatus)}
            onSave={(input) => void saveStatus(input)}
          />
        ) : (
          <div />
        )}
      </BottomSheet>
    </>
  );
}

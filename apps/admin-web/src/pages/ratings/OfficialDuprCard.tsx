import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminPlayer,
  OfficialDuprAdjustmentPreview,
  PlayerDuprCategory,
} from "@pkpkdupr/shared/player";
import { isClientError } from "../../api/client";
import {
  applyOfficialDupr,
  previewOfficialDupr,
  type OfficialDuprRequest,
} from "../../api/ratings";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { InlineError } from "../../components/ui/InlineError";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { PlayerPicker } from "../../components/ui/PlayerPicker";
import { RatingDelta } from "../../components/ui/RatingDelta";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { TextInput } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { formatRating } from "../../lib/format";
import {
  buildImpactRows,
  buildOfficialDuprRequest,
  CATEGORIES,
  CATEGORY_LABELS,
  EMPTY_FORM,
  type OfficialDuprFormValues,
} from "./officialDuprForm";

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "처리하지 못했어요. 다시 시도해 주세요.";

interface PreviewState {
  request: OfficialDuprRequest;
  playerId: string;
  username: string;
  result: OfficialDuprAdjustmentPreview;
}

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3">
    <span className="text-pk-13 font-semibold text-pk-sub">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

export const OfficialDuprCard: React.FC<{
  /** 활성 정회원(게스트 제외) */
  players: AdminPlayer[];
  /** URL `player`로 미리 고를 회원 */
  initialPlayerId?: string;
  /** 반영으로 평점이 바뀌었을 때 회원 목록을 다시 읽는다 */
  onApplied: () => void;
}> = ({ players, initialPlayerId, onApplied }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<OfficialDuprFormValues>(EMPTY_FORM);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [category, setCategory] = useState<PlayerDuprCategory>("doubles");
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 대화상자 문구는 연 시점 값으로 고정한다(반영 성공 뒤 입력을 비워도 닫히는 동안 바뀌지 않게)
  const [confirmTarget, setConfirmTarget] = useState<{
    username: string;
    impactCount: number;
  } | null>(null);
  // 입력이 바뀌면 진행 중이던 미리보기 응답을 버리기 위한 번호
  const previewRequestIdRef = useRef(0);
  const appliedInitialRef = useRef(false);

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const selectedPlayer = form.playerId ? playersById.get(form.playerId) : undefined;

  // 회원 목록이 처음 들어오면 URL로 받은 회원을 한 번만 미리 고른다
  useEffect(() => {
    if (appliedInitialRef.current || !initialPlayerId || players.length === 0) return;
    appliedInitialRef.current = true;
    if (playersById.has(initialPlayerId)) {
      setForm((prev) => ({ ...prev, playerId: initialPlayerId }));
    }
  }, [initialPlayerId, players.length, playersById]);

  // 회원 목록을 다시 읽었으면(재계산·반영 뒤) 지금 평점이 바뀌었을 수 있으니 미리보기를 무효로 한다
  useEffect(() => {
    previewRequestIdRef.current += 1;
    setPreview(null);
    setPreviewing(false);
  }, [players]);

  // 입력을 하나라도 바꾸면 미리보기를 무효로 한다(같은 값으로 되돌려도 다시 미리 봐야 한다)
  const updateForm = (update: (prev: OfficialDuprFormValues) => OfficialDuprFormValues) => {
    previewRequestIdRef.current += 1;
    setForm(update);
    setPreview(null);
    setPreviewing(false);
    setError(null);
  };

  const formResult = buildOfficialDuprRequest(form);
  // 고른 회원이 다시 읽은 목록에서 빠지면 입력칸이 비어 보이므로 미리보기도 막는다
  const canPreview = Boolean(selectedPlayer) && formResult.ok && !previewing;

  const handlePreview = async () => {
    if (!selectedPlayer || !formResult.ok) return;
    const requestId = ++previewRequestIdRef.current;
    const playerId = selectedPlayer.id;
    const username = selectedPlayer.username;
    const request = formResult.request;
    setPreviewing(true);
    setError(null);
    try {
      const result = await previewOfficialDupr(playerId, request);
      if (requestId !== previewRequestIdRef.current) return;
      setPreview({ request, playerId, username, result });
      setCategory(request.ratings.doubles !== undefined ? "doubles" : "singles");
    } catch (err) {
      if (requestId !== previewRequestIdRef.current) return;
      if (isClientError(err)) {
        setError(err.message);
      } else {
        showToast(getErrorMessage(err));
      }
    } finally {
      if (requestId === previewRequestIdRef.current) setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    const username = confirmTarget?.username ?? preview.username;
    try {
      const result = await applyOfficialDupr(preview.playerId, preview.request);
      const changedCount = new Set(result.ratingChangeLogs.map((log) => log.playerId)).size;
      showToast(`${username} 공식 DUPR을 반영했어요 · 평점이 바뀐 회원 ${changedCount}명`);
      previewRequestIdRef.current += 1;
      setForm(EMPTY_FORM);
      setPreview(null);
      setError(null);
      onApplied();
    } catch (err) {
      // 입력 오류(4xx)는 카드 안 문구로 보이고, 그 밖의 실패는 대화상자에 남겨 다시 시도하게 한다
      if (!isClientError(err)) throw err;
      setError(err.message);
    }
  };

  const openConfirm = () => {
    if (!preview) return;
    setConfirmTarget({
      username: preview.username,
      impactCount: preview.result.impacts.length,
    });
  };

  const rows = useMemo(
    () =>
      preview
        ? buildImpactRows(preview.result.impacts, category, (playerId) => {
            const player = playersById.get(playerId);
            return player ? (player.duprRating?.[category] ?? null) : undefined;
          })
        : [],
    [preview, category, playersById],
  );

  const setRating = (target: PlayerDuprCategory, value: string) =>
    updateForm((prev) => ({ ...prev, ratings: { ...prev.ratings, [target]: value } }));
  const setConfidence = (target: PlayerDuprCategory, value: string) =>
    updateForm((prev) => ({
      ...prev,
      confidence: { ...prev.confidence, [target]: value },
    }));

  return (
    <Card>
      <h2 className="text-pk-17 font-bold text-pk-ink">공식 DUPR 반영</h2>
      <p className="mt-1 text-pk-13 text-pk-sub">
        공식 DUPR 점수를 기준점으로 넣고 전체 경기를 다시 계산해요. 반영 시점에 가까운 경기일수록
        파트너·상대 평점에 크게 반영돼요(30일 반감기).
      </p>

      <div className="mt-5 space-y-3">
        <FieldRow label="회원">
          {selectedPlayer ? (
            <div className="flex h-10 items-center gap-2.5 rounded-pk-sm bg-pk-bg pl-3 pr-1">
              <PlayerAvatar player={selectedPlayer} size={24} />
              <span className="min-w-0 flex-1 truncate text-pk-15 font-semibold text-pk-ink">
                {selectedPlayer.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateForm((prev) => ({ ...prev, playerId: null }))}
              >
                바꾸기
              </Button>
            </div>
          ) : (
            <PlayerPicker
              players={players}
              onSelect={(playerId) => updateForm((prev) => ({ ...prev, playerId }))}
            />
          )}
        </FieldRow>
        <FieldRow label="사유">
          <TextInput
            value={form.reason}
            placeholder="선택"
            aria-label="사유"
            onChange={(event) => {
              const reason = event.target.value;
              updateForm((prev) => ({ ...prev, reason }));
            }}
          />
        </FieldRow>
        {CATEGORIES.map((target) => (
          <FieldRow key={target} label={`${CATEGORY_LABELS[target]} 평점 · 신뢰도`}>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.001"
                min={2}
                max={8}
                value={form.ratings[target]}
                placeholder={target === "singles" ? "비워 두면 그대로" : "2~8"}
                aria-label={`${CATEGORY_LABELS[target]} 평점`}
                className="tabular-nums"
                onChange={(event) => setRating(target, event.target.value)}
              />
              <div className="relative">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={0}
                  max={100}
                  value={form.confidence[target]}
                  placeholder="0~100"
                  aria-label={`${CATEGORY_LABELS[target]} 신뢰도(%)`}
                  className="pr-8 tabular-nums"
                  onChange={(event) => setConfidence(target, event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-pk-15 text-pk-muted">
                  %
                </span>
              </div>
            </div>
          </FieldRow>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <div className="min-w-0 flex-1">
          <InlineError message={formResult.ok ? error : formResult.message ?? error} />
        </div>
        <Button variant="soft" disabled={!canPreview} onClick={() => void handlePreview()}>
          {previewing ? "미리 보는 중…" : "영향 미리보기"}
        </Button>
      </div>

      {preview && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-pk-15 font-bold text-pk-ink">
              반영하면 평점이 바뀌는 회원 {rows.length}명
            </h3>
            <SegmentedControl
              ariaLabel="평점 분류"
              value={category}
              onChange={setCategory}
              options={CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
            />
          </div>
          {rows.length === 0 ? (
            <p className="mt-3 text-pk-13 text-pk-sub">
              {CATEGORY_LABELS[category]} 평점이 바뀌는 회원이 없어요.
            </p>
          ) : (
            <table className="mt-3 w-full text-pk-15">
              <thead>
                <tr className="border-b border-pk-divider text-left text-pk-12 font-semibold text-pk-sub">
                  <th className="p-3 pl-0 font-semibold">회원</th>
                  <th className="p-3 text-right font-semibold">지금</th>
                  <th className="p-3 text-right font-semibold">반영 후</th>
                  <th className="p-3 text-right font-semibold">변화</th>
                  <th className="p-3 pr-0 text-right font-semibold">관련 경기</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.playerId} className="border-b border-pk-divider last:border-b-0">
                    <td className="p-3 pl-0 font-semibold text-pk-ink">{row.username}</td>
                    <td className="p-3 text-right tabular-nums text-pk-sub">
                      {formatRating(row.current)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-pk-ink">
                      {formatRating(row.next)}
                    </td>
                    <td className="p-3 text-right">
                      {row.current === null ? (
                        <span className="font-semibold text-pk-primary">첫 평점</span>
                      ) : (
                        <RatingDelta value={row.delta} />
                      )}
                    </td>
                    <td className="p-3 pr-0 text-right tabular-nums text-pk-sub">
                      {row.relatedMatchCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-pk-divider pt-4">
        <p className="text-pk-13 text-pk-sub">
          입력을 바꾸면 미리보기가 사라지고, 다시 미리 봐야 반영할 수 있어요.
        </p>
        <Button
          variant="outline"
          disabled={!preview || confirmTarget !== null}
          onClick={openConfirm}
        >
          반영하기…
        </Button>
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={`${confirmTarget?.username ?? ""} 공식 DUPR을 반영할까요?`}
        description={`전체 경기를 다시 계산해 ${confirmTarget?.impactCount ?? 0}명의 평점이 바뀌어요.`}
        confirmLabel="반영하기"
        onConfirm={handleApply}
        onClose={() => setConfirmTarget(null)}
      />
    </Card>
  );
};

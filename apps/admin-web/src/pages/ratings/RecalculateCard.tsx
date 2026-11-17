import React, { useState } from "react";
import { recalculateRatings } from "../../api/ratings";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";

export const RecalculateCard: React.FC<{
  /** 다시 계산으로 평점이 바뀌었을 때 회원 목록을 다시 읽는다 */
  onRecalculated: () => void;
}> = ({ onRecalculated }) => {
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);

  // 실패하면 throw해 확인 대화상자 안에 문구를 남긴다
  const handleRecalculate = async () => {
    setRunning(true);
    try {
      const result = await recalculateRatings();
      showToast(
        `${result.completedMatchCount}경기로 다시 계산했어요 · 평점이 바뀐 회원 ${result.changedPlayerCount}명`,
      );
      onRecalculated();
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <h2 className="text-pk-17 font-bold text-pk-ink">전체 평점 다시 계산</h2>
      <p className="mt-1 text-pk-13 text-pk-sub">
        완료 경기를 처음부터 다시 돌려 모든 회원의 평점을 새로 만들어요. 평점 미반영 경기는
        빠져요. 경기 정정·삭제는 저장할 때 알아서 다시 계산하니 평소엔 누를 일이 없어요.
      </p>
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          disabled={running || confirmOpen}
          onClick={() => setConfirmOpen(true)}
        >
          {running ? "계산 중…" : "다시 계산…"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="전체 평점을 다시 계산할까요?"
        description="완료 경기를 처음부터 다시 돌려 모든 회원의 평점을 새로 만들어요."
        confirmLabel="다시 계산"
        onConfirm={handleRecalculate}
        onClose={() => setConfirmOpen(false)}
      />
    </Card>
  );
};

import React, { useCallback, useState } from "react";
import type { OpponentStat, PartnerStat } from "@pkpkdupr/shared/profileStats";
import ListPushScreen from "@/components/ListPushScreen";
import PartnerChemistryCard from "@/components/profile/PartnerChemistryCard";
import RivalCard from "@/components/profile/RivalCard";
import { PreviewSection } from "@/components/ui/Section";
import type { TabKey } from "@/context/TabNavigationContext";

export interface PartnerRivalSectionsProps {
  partners: readonly PartnerStat[];
  rivals: readonly OpponentStat[];
  tabKey: TabKey;
  /** 전체 보기 화면 깊이 id 앞부분. `:partners`·`:rivals`를 붙여 쓴다 */
  depthId: string;
  /** 전체 보기 제목 앞에 붙이는 말(다른 회원이면 "<아이디> ") */
  titlePrefix?: string;
  /** false면 전체 보기 화면을 닫는다. 프로필 화면이 닫힐 때 위에 남지 않게 한다 */
  isParentOpen?: boolean;
}

/**
 * 파트너 궁합·천적 미리보기 섹션과 전체 보기 화면. 목록이 비면 그 섹션은 그리지 않는다.
 * 전체 보기 화면은 포털로 그려지므로 섹션 목록 사이에 둬도 레이아웃에 끼지 않는다.
 */
export default function PartnerRivalSections({
  partners,
  rivals,
  tabKey,
  depthId,
  titlePrefix = "",
  isParentOpen = true,
}: PartnerRivalSectionsProps): React.ReactElement {
  const [isPartnersRequested, setIsPartnersRequested] = useState(false);
  const [isRivalsRequested, setIsRivalsRequested] = useState(false);
  const closePartners = useCallback(() => setIsPartnersRequested(false), []);
  const closeRivals = useCallback(() => setIsRivalsRequested(false), []);

  return (
    <>
      {partners.length > 0 ? (
        <PreviewSection
          title="파트너 궁합"
          items={partners}
          renderPreview={(preview) => (
            <PartnerChemistryCard partners={preview} />
          )}
          onViewAll={() => setIsPartnersRequested(true)}
        />
      ) : null}
      {rivals.length > 0 ? (
        <PreviewSection
          title="천적"
          items={rivals}
          renderPreview={(preview) => <RivalCard rivals={preview} />}
          onViewAll={() => setIsRivalsRequested(true)}
        />
      ) : null}
      <ListPushScreen
        isOpen={isPartnersRequested && isParentOpen}
        tabKey={tabKey}
        depthId={`${depthId}:partners`}
        title={`${titlePrefix}파트너 궁합`}
        onClose={closePartners}
      >
        <PartnerChemistryCard partners={partners} ordered />
      </ListPushScreen>
      <ListPushScreen
        isOpen={isRivalsRequested && isParentOpen}
        tabKey={tabKey}
        depthId={`${depthId}:rivals`}
        title={`${titlePrefix}천적`}
        onClose={closeRivals}
      >
        <RivalCard rivals={rivals} ordered />
      </ListPushScreen>
    </>
  );
}

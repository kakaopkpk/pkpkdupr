/** 공유·내려받기 파일 이름 "pkpkdupr-<조각>-<조각>.png". 파일 이름으로 못 쓰는 글자는 -로 바꾼다 */
export const toShareFileName = (...slugs: string[]) =>
  `pkpkdupr-${slugs.map((slug) => slug.replace(/[^A-Za-z0-9.-]/g, "-")).join("-")}.png`;

/**
 * 기기 공유 시트로 이미지를 보낸다. 파일 공유를 못 하는 브라우저(PC 등)는 내려받고, 사용자가 공유 시트를 닫은 것은 무시한다.
 * 사용자 동작 직후에만 공유 시트가 열리는 브라우저(iOS Safari)가 있어, 파일은 미리 만들어 넘긴다
 */
export const shareImageFile = async (
  file: File,
  text: string,
): Promise<void> => {
  const shareData: ShareData = { files: [file], text };
  if (typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // 공유가 거절되면(권한·사용자 동작 만료 등) 내려받기로 넘어간다
    }
  }
  downloadFile(file);
};

const downloadFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 내려받기가 시작된 뒤에 푼다
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

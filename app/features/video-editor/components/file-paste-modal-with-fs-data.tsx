import { use } from "react";
import { StandaloneFilePasteModal } from "@/components/standalone-file-paste-modal";
import { LessonFilePasteModal } from "@/components/lesson-file-paste-modal";

type FsData = {
  hasExplainerFolder: boolean;
  standaloneFiles: Array<{ path: string }>;
  files: Array<{ path: string; size: number; defaultEnabled: boolean }>;
};

export const FilePasteModalWithFsData = (props: {
  fsData: Promise<FsData>;
  lessonId?: string;
  videoId: string;
  isPasteModalOpen: boolean;
  handlePasteModalClose: (open: boolean) => void;
  handleFileCreated: () => void;
}) => {
  const fsData = use(props.fsData);
  return props.lessonId ? (
    <LessonFilePasteModal
      videoId={props.videoId}
      open={props.isPasteModalOpen}
      onOpenChange={props.handlePasteModalClose}
      existingFiles={fsData.files}
      onFileCreated={props.handleFileCreated}
    />
  ) : (
    <StandaloneFilePasteModal
      videoId={props.videoId}
      open={props.isPasteModalOpen}
      onOpenChange={props.handlePasteModalClose}
      existingFiles={fsData.standaloneFiles}
      onFileCreated={props.handleFileCreated}
    />
  );
};

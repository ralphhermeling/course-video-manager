import { useState } from "react";
import { TldrawImage } from "tldraw";
import "tldraw/tldraw.css";

export const DiagramThumbnail = (props: {
  diagramId?: string;
  contentHash?: string;
  scene?: unknown;
  className?: string;
  darkMode?: boolean;
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const url =
    props.diagramId && props.contentHash
      ? `/api/diagram-thumbnails/${props.diagramId}/${props.contentHash}`
      : null;

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt=""
        className={props.className}
        onError={() => setImgFailed(true)}
      />
    );
  }

  if (
    props.scene &&
    typeof props.scene === "object" &&
    "store" in props.scene
  ) {
    return (
      <div className={props.className}>
        <TldrawImage
          snapshot={{ document: props.scene } as never}
          darkMode={props.darkMode ?? true}
          background={false}
        />
      </div>
    );
  }

  return <div className={props.className} />;
};

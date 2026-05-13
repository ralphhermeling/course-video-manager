import { TldrawImage } from "tldraw";
import "tldraw/tldraw.css";

export const DiagramThumbnail = (props: {
  scene: unknown;
  className?: string;
  darkMode?: boolean;
}) => {
  if (
    !props.scene ||
    typeof props.scene !== "object" ||
    !("store" in props.scene)
  ) {
    return <div className={props.className} />;
  }

  return (
    <div className={props.className}>
      <TldrawImage
        snapshot={{ document: props.scene } as never}
        darkMode={props.darkMode ?? true}
        background={false}
      />
    </div>
  );
};

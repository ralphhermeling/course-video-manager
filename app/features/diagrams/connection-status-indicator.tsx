import { AlertTriangle, Link2, Pin } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ConnectionStatusIndicator({
  editorConnected,
  windowFocused,
}: {
  editorConnected: boolean;
  windowFocused: boolean;
}) {
  const status: "disconnected" | "connected" | "pinning" = !editorConnected
    ? "disconnected"
    : windowFocused
      ? "pinning"
      : "connected";
  const label =
    status === "disconnected"
      ? "Not connected to a video editor"
      : status === "pinning"
        ? "Diagram focused — snapshots will pin to clips ending now"
        : "Connected to video editor — focus this window to pin snapshots";
  const Icon =
    status === "disconnected"
      ? AlertTriangle
      : status === "pinning"
        ? Pin
        : Link2;
  const palette =
    status === "disconnected"
      ? "bg-amber-900/80 text-amber-300"
      : status === "pinning"
        ? "bg-emerald-700/80 text-emerald-100"
        : "bg-zinc-700/80 text-zinc-300";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          aria-label={label}
          className={
            "absolute bottom-28 right-2 z-50 flex h-9 w-9 items-center justify-center rounded-full shadow " +
            palette
          }
        >
          <Icon className="h-4 w-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

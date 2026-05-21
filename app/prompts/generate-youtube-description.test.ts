import { describe, it, expect } from "vitest";
import { generateYoutubeDescriptionPrompt } from "./generate-youtube-description";

describe("generateYoutubeDescriptionPrompt", () => {
  const baseOpts = {
    code: [],
    transcript: "This is a test transcript about TypeScript generics.",
    images: [],
    youtubeChapters: [],
    links: [],
  };

  it("includes a global no-emojis instruction outside the opening summary rules", () => {
    const prompt = generateYoutubeDescriptionPrompt(baseOpts);

    const noEmojiMatches = [...prompt.matchAll(/emoji/gi)];

    const globalNoEmoji = noEmojiMatches.some((match) => {
      const before = prompt.slice(
        Math.max(0, match.index! - 200),
        match.index!
      );
      return (
        !before.includes("Opening Summary") &&
        !before.includes("300 characters")
      );
    });

    expect(globalNoEmoji).toBe(true);
  });
});

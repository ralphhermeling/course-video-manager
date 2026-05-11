export interface SSESkillsChangelogParams {
  videoId: string;
  title: string;
  slug: string;
  body: string;
  description: string;
  newsletterSubject: string;
  newsletterPreviewText: string;
  newsletterCopy: string;
}

export interface SSESkillsChangelogCallbacks {
  onProgress: (percentage: number) => void;
  onComplete: (slug: string) => void;
  onError: (message: string) => void;
}

export const startSSESkillsChangelogPost = (
  params: SSESkillsChangelogParams,
  callbacks: SSESkillsChangelogCallbacks
): AbortController => {
  const abortController = new AbortController();

  performSSESkillsChangelogPost(
    params,
    callbacks,
    abortController.signal
  ).catch((error) => {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    callbacks.onError(
      error instanceof Error ? error.message : "Skills Changelog post failed"
    );
  });

  return abortController;
};

const performSSESkillsChangelogPost = async (
  params: SSESkillsChangelogParams,
  callbacks: SSESkillsChangelogCallbacks,
  signal: AbortSignal
): Promise<void> => {
  const response = await fetch(
    `/api/videos/${params.videoId}/post-skills-changelog`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: params.title,
        slug: params.slug,
        body: params.body,
        description: params.description,
        newsletterSubject: params.newsletterSubject,
        newsletterPreviewText: params.newsletterPreviewText,
        newsletterCopy: params.newsletterCopy,
      }),
      signal,
    }
  );

  if (!response.ok || !response.body) {
    callbacks.onError("Failed to start Skills Changelog post");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ") && eventType) {
        const eventData = JSON.parse(line.slice(6));
        if (eventType === "progress") {
          callbacks.onProgress(eventData.percentage);
        } else if (eventType === "complete") {
          callbacks.onComplete(eventData.slug);
        } else if (eventType === "error") {
          callbacks.onError(eventData.message);
        }
        eventType = "";
      }
    }
  }
};

/** Header label for a repository link: "GitHub" for github.com, else generic. */
export function repoLinkLabel(repoUrl: string): string {
  try {
    const host = new URL(repoUrl).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com") ? "GitHub" : "Repository";
  } catch {
    return "Repository";
  }
}

